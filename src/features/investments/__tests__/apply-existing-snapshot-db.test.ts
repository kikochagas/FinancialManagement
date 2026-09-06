import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import {
  applyExistingBrokerSnapshot,
  applyBrokerSnapshot,
} from "../actions-apply";
import * as orchestrator from "../broker-import/orchestrator";
import { BrokerSnapshot } from "../broker-import/schema";

vi.mock("../broker-import/orchestrator", () => ({
  extractBrokerSnapshot: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("user-existing-test"),
}));

describe("applyExistingBrokerSnapshot DB Engine", () => {
  const userId = "user-existing-test";
  const accountId = "acc-existing-test";

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.investmentSnapshotTotal.deleteMany();
    await db.investmentCashSnapshot.deleteMany();
    await db.investmentPositionSnapshot.deleteMany();
    await db.investmentAccountSnapshot.deleteMany();
    await db.investment.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();

    await db.user.createMany({
      data: [
        { id: userId, email: "user@test.com", passwordHash: "x" },
        { id: "user-b", email: "user-b@test.com", passwordHash: "x" },
      ],
    });

    await db.account.createMany({
      data: [
        {
          id: accountId,
          userId,
          name: "Broker",
          type: "Broker",
          currency: "EUR",
          balance: 0,
        },
        {
          id: "acc-b",
          userId: "user-b",
          name: "Other Broker",
          type: "Broker",
          currency: "EUR",
          balance: 0,
        },
      ],
    });
  });

  const setupMockSnapshotAndUpload = async () => {
    const mockSnapshot: BrokerSnapshot = {
      statementDate: "2026-08-30",
      dateProvenance: "DOCUMENT",
      documentFingerprint: "fingerprint-123",
      completeness: "COMPLETE",
      capabilities: [
        "POSITIONS",
        "CASH_BALANCES",
        "PRICES",
        "QUANTITIES",
        "MARKET_VALUES",
      ],
      positions: [
        {
          name: "Apple",
          sourceSection: "BROKERAGE",
          assetClass: "EQUITY",
          ticker: "AAPL",
          isin: "US0378331005",
          instrumentIdentifier: "US0378331005",
          instrumentIdentifierType: "ISIN",
          quantity: 10,
          unitPrice: 150,
          marketValue: 1500,
          currency: "USD",
        },
        {
          name: "Google",
          sourceSection: "BROKERAGE",
          assetClass: "EQUITY",
          ticker: "GOOGL",
          isin: "US38259P5089",
          instrumentIdentifier: "US38259P5089",
          instrumentIdentifierType: "ISIN",
          quantity: 5,
          unitPrice: 200,
          marketValue: 1000,
          currency: "USD",
        },
      ],
      cashBalances: [
        { type: "AVAILABLE", label: "Cash", currency: "EUR", amount: 1500 },
      ],
      totals: [
        { type: "OVERALL", label: "Total", currency: "EUR", amount: 3000 },
      ],
    };

    vi.mocked(orchestrator.extractBrokerSnapshot).mockResolvedValueOnce(
      mockSnapshot,
    );

    const res = await applyBrokerSnapshot({
      accountId,
      fileBase64: "dummy",
      positionIntents: [
        { candidateIndex: 0, action: "SKIP" },
        { candidateIndex: 1, action: "SKIP" },
      ],
      updateCashBalance: false,
    });

    const snapshotRow = await db.investmentAccountSnapshot.findFirst({
      where: { documentFingerprint: "fingerprint-123" },
    });

    return { mockSnapshot, snapshotId: snapshotRow!.id };
  };

  it("duplicate PDF response includes existingSnapshotId safely and no duplicate snapshot persisted", async () => {
    const { snapshotId } = await setupMockSnapshotAndUpload();

    const mockSnapshot2: BrokerSnapshot = {
      statementDate: "2026-08-30",
      documentFingerprint: "fingerprint-123",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [],
      totals: [],
    };
    vi.mocked(orchestrator.extractBrokerSnapshot).mockResolvedValueOnce(
      mockSnapshot2,
    );

    const res = await applyBrokerSnapshot({
      accountId,
      fileBase64: "dummy",
      positionIntents: [],
      updateCashBalance: false,
    });

    expect(res?.data?.success).toBe(false);
    expect(res?.data?.error).toBe("DUPLICATE_FINGERPRINT");
    expect(res?.data?.existingSnapshotId).toBe(snapshotId);

    const count = await db.investmentAccountSnapshot.count();
    expect(count).toBe(1); // No new snapshot persisted
  });

  it("existing snapshot ownership cross-user rejection", async () => {
    const { snapshotId } = await setupMockSnapshotAndUpload();

    // Mock getUserId to return User B while attempting to apply Snapshot A
    const auth = await import("@/lib/auth");
    (auth.getUserId as any).mockResolvedValueOnce("user-b");

    const res = await applyExistingBrokerSnapshot({
      snapshotId,
      positionIntents: [],
      updateCashBalance: false,
    });

    expect(res?.serverError).toMatch(/Unauthorized existing snapshot/);
  });

  it("repeated existing-snapshot apply remains safe/idempotent based on fresh reconciliation", async () => {
    const { snapshotId } = await setupMockSnapshotAndUpload();

    // First time: fresh DB, so both are NEW.
    // User chooses CREATE for both.
    await applyExistingBrokerSnapshot({
      snapshotId,
      positionIntents: [
        { candidateIndex: 0, action: "CREATE" },
        { candidateIndex: 1, action: "CREATE" },
      ],
      updateCashBalance: true,
    });

    let invs = await db.investment.findMany({
      where: { accountId },
      orderBy: { symbol: "asc" },
    });
    expect(invs.length).toBe(2);
    expect(invs[0].symbol).toBe("AAPL");
    expect(invs[1].symbol).toBe("GOOGL");

    let count = await db.investmentAccountSnapshot.count();
    expect(count).toBe(1); // no second snapshot row created

    // Second time: investments exist. Fresh reconciliation will evaluate them as MATCHED.
    // User chooses UPDATE for first, SKIP for second.
    // But first let's alter the investment value slightly to prove update works.
    await db.investment.update({
      where: { id: invs[0].id },
      data: { marketValue: 1400 }, // Apple changed
    });

    await applyExistingBrokerSnapshot({
      snapshotId,
      positionIntents: [
        { candidateIndex: 0, action: "UPDATE" },
        { candidateIndex: 1, action: "SKIP" },
      ],
      updateCashBalance: false,
    });

    invs = await db.investment.findMany({
      where: { accountId },
      orderBy: { symbol: "asc" },
    });
    expect(invs.length).toBe(2);
    // AAPL should be updated back to 1500 from the snapshot
    expect(invs[0].marketValue).toBe(1500);
    expect(invs[1].marketValue).toBe(1000);

    count = await db.investmentAccountSnapshot.count();
    expect(count).toBe(1);
  });

  afterAll(async () => {
    await db.investmentPositionSnapshot.deleteMany();
    await db.investmentCashSnapshot.deleteMany();
    await db.investmentSnapshotTotal.deleteMany();
    await db.investmentAccountSnapshot.deleteMany();
    await db.investment.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });
});
