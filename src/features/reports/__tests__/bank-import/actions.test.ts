import { describe, it, expect, vi, beforeEach } from "vitest";
import { importBankStatementAction } from "../../bank-import/actions";
import { db } from "../../../../lib/db";

// Use deep mocking for db
vi.mock("../../../../lib/db", () => ({
  db: {
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    transaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
    }
  }
}));

vi.mock("../../../../lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
  getSession: vi.fn().mockResolvedValue({ userId: "test-user-id" }),
}));

describe("importBankStatementAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if account has an active open banking mapping", async () => {
    // Mock db.account.findFirst to return an account with active mapping
    (db.account.findFirst as any).mockResolvedValue({
      id: "acc_1",
      userId: "user_1",
      externalMappings: [
        { disconnectedAt: null } // ACTIVE
      ]
    });

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
    });

    // The safe-action client returns a serverError when an error is thrown
    expect(result?.serverError).toContain("Cannot import unstructured bank statement into an actively connected Open Banking account");
  });

  it("accepts historically disconnected accounts and manual accounts", async () => {
    (db.account.findFirst as any).mockResolvedValue({
      id: "acc_1",
      userId: "user_1",
      externalMappings: [
        { disconnectedAt: new Date() } // HISTORICAL
      ]
    });

    // Mock the $transaction to just execute the callback
    (db.$transaction as any).mockImplementation(async (cb: any) => {
      return cb(db);
    });

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
    });

    expect(result?.data?.success).toBe(true);
  });

  it("server accepts EUR rows for EUR account", async () => {
    (db.account.findFirst as any).mockResolvedValue({ id: "acc_1", currency: "EUR", externalMappings: [] });
    (db.$transaction as any).mockImplementation(async (cb: any) => cb(db));

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [
        { bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit", currency: "EUR" }
      ]
    });

    expect(result?.data?.success).toBe(true);
  });

  it("server rejects USD rows for EUR account", async () => {
    (db.account.findFirst as any).mockResolvedValue({ id: "acc_1", currency: "EUR", externalMappings: [] });

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [
        { bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit", currency: "USD" }
      ]
    });

    expect(result?.serverError).toContain("Statement currency does not match account currency");
  });

  it("server rejects mixed-currency rows", async () => {
    (db.account.findFirst as any).mockResolvedValue({ id: "acc_1", currency: "EUR", externalMappings: [] });

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [
        { bookingDate: "2026-08-12", description: "test1", amount: 10, direction: "Credit", currency: "EUR" },
        { bookingDate: "2026-08-12", description: "test2", amount: 10, direction: "Credit", currency: "USD" }
      ]
    });

    expect(result?.serverError).toContain("Cannot import multi-currency statements");
  });

  it("server accepts mixed unknown and known currency rows matching account", async () => {
    (db.account.findFirst as any).mockResolvedValue({ id: "acc_1", currency: "EUR", externalMappings: [] });
    (db.$transaction as any).mockImplementation(async (cb: any) => cb(db));

    const result = await importBankStatementAction({
      accountId: "acc_1",
      updateBalance: false,
      transactions: [
        { bookingDate: "2026-08-12", description: "test1", amount: 10, direction: "Credit", currency: "EUR" },
        { bookingDate: "2026-08-12", description: "test2", amount: 10, direction: "Credit", currency: null } // derived from bare $ or absent
      ]
    });

    expect(result?.data?.success).toBe(true);
  });

  describe("Validation constraints", () => {
    it("rejects empty transactions array", async () => {
      const result = await importBankStatementAction({
        accountId: "acc_1",
        updateBalance: true,
        endingBalance: 100,
        transactions: []
      });
      expect((result?.validationErrors?.transactions as any)?._errors).toContain("At least one valid transaction is required.");
    });

    it("rejects Infinity endingBalance", async () => {
      const result = await importBankStatementAction({
        accountId: "acc_1",
        updateBalance: true,
        endingBalance: Infinity,
        transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
      });
      expect(result?.validationErrors?.endingBalance?._errors).toBeDefined();
    });

    it("rejects -Infinity endingBalance", async () => {
      const result = await importBankStatementAction({
        accountId: "acc_1",
        updateBalance: true,
        endingBalance: -Infinity,
        transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
      });
      expect(result?.validationErrors?.endingBalance?._errors).toBeDefined();
    });

    it("rejects NaN endingBalance", async () => {
      const result = await importBankStatementAction({
        accountId: "acc_1",
        updateBalance: true,
        endingBalance: NaN,
        transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
      });
      expect(result?.validationErrors?.endingBalance?._errors).toBeDefined();
    });

    it("accepts finite endingBalance when updateBalance is true", async () => {
      (db.account.findFirst as any).mockResolvedValue({ id: "acc_1", currency: "EUR", externalMappings: [] });
      (db.$transaction as any).mockImplementation(async (cb: any) => cb(db));

      const result = await importBankStatementAction({
        accountId: "acc_1",
        updateBalance: true,
        endingBalance: 123.45,
        transactions: [{ bookingDate: "2026-08-12", description: "test", amount: 10, direction: "Credit" }]
      });
      expect(result?.data?.success).toBe(true);
    });
  });
});
