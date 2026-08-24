import { expect, test, describe, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { syncBankAccount, disconnectBank } from "../actions";

// Mock the enable-banking-client
vi.mock("@/lib/banking/enable-banking-client", () => {
  const EnableBankingClientMock = vi.fn();
  EnableBankingClientMock.prototype.getBalances = vi.fn().mockResolvedValue([
    { type: "ITBD", amount: 1000, currency: "EUR", date: new Date() }
  ]);
  EnableBankingClientMock.prototype.normalizeBalance = vi.fn().mockReturnValue({ type: "ITBD", amount: 1000, currency: "EUR", date: new Date() });
  EnableBankingClientMock.prototype.getTransactions = vi.fn().mockResolvedValue({
    transactions: [],
    skippedInvalid: 0,
    continuationKey: undefined
  });
  EnableBankingClientMock.prototype.revokeSession = vi.fn().mockResolvedValue(undefined);
  
  return { EnableBankingClient: EnableBankingClientMock };
});

// Mock the auth context
vi.mock("@/lib/safe-action", () => {
  return {
    authActionClient: {
      schema: () => ({
        action: (handler: any) => {
          return async (input: any) => {
            const res = await handler({ parsedInput: input, ctx: { userId: "test-user-ui" } });
            return { data: res };
          };
        }
      })
    }
  };
});

describe("Phase 10 UI Actions", () => {
  const userId = "test-user-ui";
  let accountId: string;
  let connectionId: string;

  beforeEach(async () => {
    // Clear test data
    await db.externalTransactionMapping.deleteMany();
    await db.transaction.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.pendingExternalAccount.deleteMany();
    await db.account.deleteMany();
    await db.bankConnection.deleteMany();
    await db.user.deleteMany();

    await db.user.create({
      data: {
        id: userId,
        email: "ui-test@example.com",
        passwordHash: "hashed",
        name: "Test User",
      }
    });

    const connection = await db.bankConnection.create({
      data: {
        userId,
        institutionName: "Test Bank",
        institutionCountry: "PT",
        status: "CONNECTED",
        providerSessionId: "session-123",
        provider: "ENABLE_BANKING"
      }
    });
    connectionId = connection.id;

    const account = await db.account.create({
      data: {
        userId,
        name: "Test Bank Account",
        type: "Bank",
        balance: 500,
        currency: "EUR"
      }
    });
    accountId = account.id;

    await db.externalAccountMapping.create({
      data: {
        bankConnectionId: connection.id,
        accountId: account.id,
        providerAccountUid: "provider-uid-123",
        identificationHash: "hash-123",
        transactionImportFrom: new Date()
      }
    });
  });

  test("syncBankAccount orchestrates balance and transactions", async () => {
    const result = await syncBankAccount({ accountId });
    
    expect((result?.data as any)?.success).toBe(true);
    expect((result?.data as any)?.balanceUpdated).toBe(true);
    expect((result?.data as any)?.imported).toBe(0);

    const updated = await db.account.findUnique({ where: { id: accountId } });
    expect(updated?.balance).toBe(1000); // from mock balance
  });

  test("disconnectBank revokes session and updates status while preserving history", async () => {
    const accMapInitial = await db.externalAccountMapping.findFirst({ where: { accountId } });
    
    // Add a dummy transaction and mapping to ensure it's preserved
    const tx = await db.transaction.create({
      data: {
        userId,
        accountId,
        amount: -10,
        type: "Expense", direction: "Debit",
        date: new Date(),
        description: "Test Tx",
        tags: ""
      }
    });
    const txMap = await db.externalTransactionMapping.create({
      data: {
        transactionId: tx.id,
        externalAccountMappingId: accMapInitial!.id,
        providerTransactionId: "ptx-123",
        dedupKey: "dedup-123"
      }
    });

    const result = await disconnectBank({ accountId });
    
    expect(result?.data?.success).toBe(true);
    
    const connection = await db.bankConnection.findUnique({ where: { id: connectionId } });
    expect(connection?.status).toBe("REVOKED");
    
    // Account still exists
    const acc = await db.account.findUnique({ where: { id: accountId } });
    expect(acc).not.toBeNull();

    // External account mapping still exists
    const accMap = await db.externalAccountMapping.findFirst({ where: { accountId } });
    expect(accMap).not.toBeNull();

    // Transactions and mappings still exist
    const txAfter = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(txAfter).not.toBeNull();

    const txMapAfter = await db.externalTransactionMapping.findUnique({ where: { transactionId: tx.id } });
    expect(txMapAfter).not.toBeNull();
  });

  test("syncBankAccount failure does not delete account", async () => {
    const { EnableBankingClient } = await import("@/lib/banking/enable-banking-client");
    (EnableBankingClient as any).prototype.getBalances.mockRejectedValueOnce(new Error("Sync failed"));
    
    const result = await syncBankAccount({ accountId });
    
    expect((result?.data as any)?.success).toBe(false);
    expect((result?.data as any)?.error).toContain("Provider synchronization failed");

    // Account still exists
    const acc = await db.account.findUnique({ where: { id: accountId } });
    expect(acc).not.toBeNull();
  });
});
