import {
  expect,
  test,
  describe,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { db } from "@/lib/db";
import { applyBrokerSnapshot } from "../actions-apply";

// Mock auth
vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user"),
}));

let orchestratorSnapshot: any = null;
vi.mock("../broker-import/orchestrator", () => ({
  extractBrokerSnapshot: async () => orchestratorSnapshot,
}));

describe("applyBrokerSnapshot DB Engine", () => {
  let user: any;
  let account: any;
  let otherAccount: any;

  beforeAll(async () => {
    user = await db.user.create({
      data: {
        email: "apply_test@example.com",
        passwordHash: "x",
        id: "test-user",
      },
    });
    account = await db.account.create({
      data: {
        userId: user.id,
        name: "Broker 1",
        type: "Broker",
        balance: 100,
        currency: "EUR",
      },
    });
    otherAccount = await db.account.create({
      data: {
        userId: user.id,
        name: "Bank",
        type: "Bank",
        balance: 0,
        currency: "EUR",
      },
    });
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: user.id } });
  });

  beforeEach(async () => {
    // Clear snapshot history and investments for test isolation
    await db.investmentAccountSnapshot.deleteMany({
      where: { accountId: account.id },
    });
    await db.investment.deleteMany({ where: { accountId: account.id } });
    await db.account.update({
      where: { id: account.id },
      data: { balance: 100 },
    });
  });

  test("rejects if statementDate is missing", async () => {
    orchestratorSnapshot = {
      // Intentionally omitting statementDate
      documentFingerprint: "fingerprint-nodate",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [],
      totals: [],
    };
    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [],
      updateCashBalance: false,
    });
    expect(res?.serverError).toMatch(/Statement date is required/);

    // Prove nothing was persisted
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
  });

  test("ownership and account-type validation", async () => {
    const res1 = await applyBrokerSnapshot({
      accountId: "wrong-id",
      fileBase64: "",
      positionIntents: [],
      updateCashBalance: false,
    });
    expect(res1?.serverError).toMatch(/Unauthorized/);

    const res2 = await applyBrokerSnapshot({
      accountId: otherAccount.id,
      fileBase64: "",
      positionIntents: [],
      updateCashBalance: false,
    });
    expect(res2?.serverError).toMatch(/Account cannot hold investments/);
  });

  test("successful persistence, CREATE intent, cash update, duplicate rejection", async () => {
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-123",
      completeness: "COMPLETE",
      positions: [
        {
          name: "Apple Inc",
          ticker: "AAPL",
          assetClass: "Stocks",
          quantity: 10,
          unitPrice: 150,
          marketValue: 1500,
          currency: "USD",
          costBasis: null,
        },
      ],
      cashBalances: [{ type: "TOTAL", currency: "EUR", amount: 500 }],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: true,
      positionIntents: [
        {
          candidateIndex: 0,
          action: "CREATE",
        },
      ],
    });

    expect(res?.data?.success).toBe(true);

    // Verify evidence persisted
    const snaps = await db.investmentAccountSnapshot.findMany({
      where: { accountId: account.id },
      include: { positions: true, cashBalances: true },
    });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].documentFingerprint).toBe("fingerprint-123");
    expect(snaps[0].positions).toHaveLength(1);
    expect(snaps[0].cashBalances[0].amount).toBe(500);

    // Verify CREATE
    const invs = await db.investment.findMany({
      where: { accountId: account.id },
    });
    expect(invs).toHaveLength(1);
    expect(invs[0].symbol).toBe("AAPL");
    expect(invs[0].marketValue).toBe(1500);
    // Cost basis should be null, as extracted
    expect(invs[0].costBasis).toBeNull();
    // Allocation should be 100 since it's the only one
    expect(invs[0].allocation).toBe(100);

    // Verify cash balance update
    const acc = await db.account.findUnique({ where: { id: account.id } });
    expect(acc?.balance).toBe(500); // Updated from 100

    // Duplicate rejection
    const dupRes = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: false,
      positionIntents: [],
    });
    expect(dupRes?.data?.error).toBe("DUPLICATE_FINGERPRINT");
  });

  test("MATCHED approved update, SKIP untreated, NULL costBasis preserved", async () => {
    // 1. Create an existing investment
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "Microsoft",
        type: "Stocks",
        symbol: "MSFT",
        quantity: 5,
        marketValue: 1000,
        costBasis: null,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-456",
      completeness: "COMPLETE",
      positions: [
        {
          // Matches MSFT
          ticker: "MSFT",
          quantity: 10,
          marketValue: 2000,
          currency: "USD",
          costBasis: 1500, // snapshot extracted costBasis
        },
        {
          // Unchanged (skipped)
          ticker: "TSLA",
          quantity: 2,
          marketValue: 400,
        },
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: false,
      positionIntents: [
        {
          candidateIndex: 0,
          action: "UPDATE",
        },
        {
          candidateIndex: 1,
          action: "SKIP",
        },
      ],
    });

    expect(res?.data?.success).toBe(true);

    const invs = await db.investment.findMany({
      where: { accountId: account.id },
    });
    expect(invs).toHaveLength(1); // TSLA was skipped, MSFT updated, no deletion
    expect(invs[0].quantity).toBe(10);
    expect(invs[0].marketValue).toBe(2000);
    // Cost basis should remain null since the engine doesn't update costBasis for existing investments in this pass
    expect(invs[0].costBasis).toBeNull();
    expect(invs[0].profit).toBeNull();
  });

  test("Missing existing Investment not deleted", async () => {
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "Missing",
        type: "Stocks",
        symbol: "MISS",
        quantity: 1,
        marketValue: 10,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-789",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: false,
      positionIntents: [],
    });
    expect(res?.data?.success).toBe(true);

    const invs = await db.investment.findMany({
      where: { accountId: account.id },
    });
    expect(invs).toHaveLength(1); // Still there!
  });

  test("AMBIGUOUS cannot auto-apply", async () => {
    // Create two identical ticker investments
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "A",
        type: "Stocks",
        symbol: "AMB",
        quantity: 1,
        marketValue: 10,
        allocation: 50,
      },
    });
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "B",
        type: "Stocks",
        symbol: "AMB",
        quantity: 1,
        marketValue: 10,
        allocation: 50,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-amb",
      completeness: "COMPLETE",
      positions: [{ ticker: "AMB", quantity: 2, marketValue: 20 }],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "UPDATE" }],
    });

    expect(res?.serverError).toMatch(/Cannot silently apply AMBIGUOUS/);
  });

  test("Transaction rollback on failure", async () => {
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-rollback",
      completeness: "COMPLETE",
      positions: [{ ticker: "FAIL", quantity: 2, marketValue: 20 }],
      cashBalances: [],
      totals: [],
    };

    // Intent is UPDATE but it's a NEW position (forces throw)
    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "UPDATE" }],
    });

    expect(res?.serverError).toMatch(
      /Cannot UPDATE a position with status NEW/,
    );

    // Assert NOTHING persisted
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
    const invs = await db.investment.count({
      where: { accountId: account.id },
    });
    expect(invs).toBe(0);
  });

  test("Currency mismatch and multi-currency cash does not update account balance", async () => {
    // Test 1: Mismatch
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-cash-1",
      completeness: "COMPLETE",
      positions: [],
      totals: [],
      cashBalances: [{ type: "TOTAL", currency: "USD", amount: 999 }], // Account is EUR
    };

    const res1 = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: true,
      positionIntents: [],
    });
    expect(res1?.data?.warnings).toContain(
      "Currency mismatch for cash balance. Cash balance untouched.",
    );

    // Test 2: Multi-currency
    orchestratorSnapshot.documentFingerprint = "fingerprint-cash-2";
    orchestratorSnapshot.cashBalances = [
      { type: "TOTAL", currency: "EUR", amount: 999 },
      { type: "TOTAL", currency: "USD", amount: 500 },
    ];
    const res2 = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      updateCashBalance: true,
      positionIntents: [],
    });
    expect(res2?.data?.warnings).toContain(
      "Multiple cash currencies detected. Cash balance untouched.",
    );

    const acc = await db.account.findUnique({ where: { id: account.id } });
    expect(acc?.balance).toBe(100); // Unchanged
  });

  test("Recomputes multi-investment allocations", async () => {
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "A",
        type: "Stocks",
        symbol: "A",
        quantity: 1,
        marketValue: 100,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-alloc",
      completeness: "COMPLETE",
      positions: [
        { ticker: "B", quantity: 1, marketValue: 300, assetClass: "Stocks" },
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "CREATE" }],
    });

    expect(res?.data?.success).toBe(true);

    const invs = await db.investment.findMany({
      where: { accountId: account.id },
      orderBy: { marketValue: "asc" },
    });
    expect(invs[0].symbol).toBe("A");
    expect(invs[0].allocation).toBe(25); // 100 / 400

    expect(invs[1].symbol).toBe("B");
    expect(invs[1].allocation).toBe(75); // 300 / 400
  });

  test("duplicate candidateIndex input is rejected", async () => {
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-dup",
      completeness: "COMPLETE",
      positions: [{ ticker: "DUP", quantity: 1, marketValue: 10, name: "Dup" }],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [
        { candidateIndex: 0, action: "CREATE" },
        { candidateIndex: 0, action: "CREATE" },
      ],
    });

    expect(res?.validationErrors?.positionIntents?._errors).toContain(
      "Duplicate position intents are not allowed",
    );
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
  });

  test("CREATE with null quantity, null marketValue, or no identifiable info is rejected", async () => {
    // 1. Null quantity
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-null-q",
      completeness: "COMPLETE",
      positions: [{ ticker: "Q", quantity: null, marketValue: 10, name: "Q" }],
      cashBalances: [],
      totals: [],
    };
    let res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "CREATE" }],
    });
    expect(res?.serverError).toMatch(/incomplete valuation data/);

    // 2. Null marketValue
    orchestratorSnapshot.documentFingerprint = "fingerprint-null-mv";
    orchestratorSnapshot.positions = [
      { ticker: "MV", quantity: 10, marketValue: null, name: "MV" },
    ];
    res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "CREATE" }],
    });
    expect(res?.serverError).toMatch(/incomplete valuation data/);

    // 3. No identifiable info
    orchestratorSnapshot.documentFingerprint = "fingerprint-null-id";
    orchestratorSnapshot.positions = [
      {
        quantity: 10,
        marketValue: 100,
        name: null,
        ticker: null,
        isin: null,
        instrumentIdentifier: null,
      },
    ];
    res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "CREATE" }],
    });
    expect(res?.serverError).toMatch(/without an identifiable instrument/);

    // Assert nothing persisted
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
  });

  test("CONFLICT cannot auto-apply", async () => {
    await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "Apple",
        type: "Stocks",
        symbol: "AAPL",
        isin: "US0378331005",
        quantity: 1,
        marketValue: 10,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-conflict",
      completeness: "COMPLETE",
      positions: [
        {
          ticker: "AAPL",
          isin: "US5949181045",
          quantity: 2,
          marketValue: 20,
          name: "Apple Mismatch",
        },
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "UPDATE" }],
    });

    expect(res?.serverError).toMatch(/Cannot silently apply CONFLICT/);
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
  });

  test("True cross-user ownership test", async () => {
    // Create user B
    const userB = await db.user.create({
      data: {
        email: "userB@example.com",
        passwordHash: "x",
        id: "test-user-b",
      },
    });

    // Mock getUserId to return User B while attempting to modify Account A
    const auth = await import("@/lib/auth");
    (auth.getUserId as any).mockResolvedValueOnce("test-user-b");

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-unauthorized",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [],
    });

    expect(res?.serverError).toMatch(/Unauthorized account/);
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);

    await db.user.delete({ where: { id: userB.id } });
  });

  test("Strengthened atomic rollback test", async () => {
    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-rollback-strict",
      completeness: "COMPLETE",
      positions: [
        { ticker: "VALID", quantity: 10, marketValue: 100, name: "Valid" }, // valid
        { ticker: "FAIL", quantity: null, marketValue: 20, name: "Fail" }, // invalid (null quantity)
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [
        { candidateIndex: 0, action: "CREATE" },
        { candidateIndex: 1, action: "CREATE" },
      ],
    });

    expect(res?.serverError).toMatch(/incomplete valuation data/);

    // Assert NOTHING persisted
    const snaps = await db.investmentAccountSnapshot.count({
      where: { accountId: account.id },
    });
    expect(snaps).toBe(0);
    const invs = await db.investment.count({
      where: { accountId: account.id },
    });
    expect(invs).toBe(0);
    const acc = await db.account.findUnique({ where: { id: account.id } });
    expect(acc?.balance).toBe(100);
  });

  test("MATCHED + SKIP does not touch Investment", async () => {
    const before = await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "Apple",
        type: "Stocks",
        symbol: "AAPL",
        quantity: 5,
        marketValue: 500,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-skip-mutation",
      completeness: "COMPLETE",
      positions: [
        { ticker: "AAPL", quantity: 10, marketValue: 1500, name: "Apple Inc" },
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [{ candidateIndex: 0, action: "SKIP" }],
    });

    expect(res?.data?.success).toBe(true);

    const after = await db.investment.findUnique({ where: { id: before.id } });
    expect(after).not.toBeNull();
    if (after) {
      expect(after.quantity).toBe(before.quantity);
      expect(after.marketValue).toBe(before.marketValue);
      expect(after.allocation).toBe(before.allocation);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    }
  });

  test("No position intents does not touch Investments", async () => {
    const before = await db.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        name: "Tesla",
        type: "Stocks",
        symbol: "TSLA",
        quantity: 2,
        marketValue: 400,
        allocation: 100,
      },
    });

    orchestratorSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-empty-intents",
      completeness: "COMPLETE",
      positions: [
        { ticker: "TSLA", quantity: 10, marketValue: 2000, name: "Tesla" },
      ],
      cashBalances: [],
      totals: [],
    };

    const res = await applyBrokerSnapshot({
      accountId: account.id,
      fileBase64: "dummy",
      positionIntents: [],
    });

    expect(res?.data?.success).toBe(true);

    const after = await db.investment.findUnique({ where: { id: before.id } });
    expect(after).not.toBeNull();
    if (after) {
      expect(after.quantity).toBe(before.quantity);
      expect(after.marketValue).toBe(before.marketValue);
      expect(after.allocation).toBe(before.allocation);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    }
  });
});
