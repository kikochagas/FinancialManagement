import { expect, test, describe, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { disconnectBank, syncBankAccount, updateAccount } from "../actions";

// Mock the enable-banking-client
vi.mock("@/lib/banking/enable-banking-client", () => {
  const EnableBankingClientMock = vi.fn();
  EnableBankingClientMock.prototype.revokeSession = vi.fn().mockResolvedValue(undefined);
  EnableBankingClientMock.prototype.getBalances = vi.fn().mockResolvedValue([]);
  EnableBankingClientMock.prototype.normalizeBalance = vi.fn().mockReturnValue(null);
  EnableBankingClientMock.prototype.getTransactions = vi.fn().mockResolvedValue({ transactions: [], skippedInvalid: 0 });
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

describe("Shared Session Disconnect", () => {
  const userId = "test-user-ui";
  let accountFranciscoId: string;
  let accountMillenniumId: string;
  let connectionId: string;
  let mappingAId: string;
  let mappingBId: string;

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
        email: "ui-test2@example.com",
        passwordHash: "hashed",
        name: "Test User",
      }
    });

    const connection = await db.bankConnection.create({
      data: {
        id: "connection-1",
        userId,
        institutionName: "Mock ASPSP",
        institutionCountry: "PT",
        status: "CONNECTED",
        providerSessionId: "session-1",
        provider: "ENABLE_BANKING"
      }
    });
    connectionId = connection.id;

    const accountA = await db.account.create({
      data: {
        id: "account-francisco",
        userId,
        name: "Francisco Test Account",
        type: "Bank",
        balance: 500,
        currency: "EUR"
      }
    });
    accountFranciscoId = accountA.id;

    const accountB = await db.account.create({
      data: {
        id: "account-millennium",
        userId,
        name: "Millennium BCP",
        type: "Bank",
        balance: 1000,
        currency: "EUR"
      }
    });
    accountMillenniumId = accountB.id;

    const mappingA = await db.externalAccountMapping.create({
      data: {
        bankConnectionId: connection.id,
        accountId: accountFranciscoId,
        providerAccountUid: "current-account",
        identificationHash: "hash-a",
        disconnectedAt: null
      }
    });
    mappingAId = mappingA.id;

    const mappingB = await db.externalAccountMapping.create({
      data: {
        bankConnectionId: connection.id,
        accountId: accountMillenniumId,
        providerAccountUid: "account-2",
        identificationHash: "hash-b",
        disconnectedAt: null
      }
    });
    mappingBId = mappingB.id;
  });

  test("Disconnecting Francisco does not revoke the session", async () => {
    const { EnableBankingClient } = await import("@/lib/banking/enable-banking-client");
    
    // Call disconnect
    const result = await disconnectBank({ accountId: accountFranciscoId });
    expect(result?.data?.success).toBe(true);

    // Verify Mapping A is disconnected
    const mappingA = await db.externalAccountMapping.findUnique({ where: { id: mappingAId } });
    expect(mappingA?.disconnectedAt).not.toBeNull();

    // Verify Mapping B remains connected
    const mappingB = await db.externalAccountMapping.findUnique({ where: { id: mappingBId } });
    expect(mappingB?.disconnectedAt).toBeNull();

    // Verify connection remains CONNECTED
    const connection = await db.bankConnection.findUnique({ where: { id: connectionId } });
    expect(connection?.status).toBe("CONNECTED");

    // Verify revoke was NOT called
    expect(EnableBankingClient.prototype.revokeSession).not.toHaveBeenCalled();

    // Verify both accounts still exist
    const accA = await db.account.findUnique({ where: { id: accountFranciscoId } });
    expect(accA).not.toBeNull();
    
    // Test Sync isolation: Francisco should fail, Millennium should succeed (mostly, it fails on mock empty balances, but not on 'not connected')
    const syncResA = await syncBankAccount({ accountId: accountFranciscoId });
    expect((syncResA?.data as any)?.error).toBe("Account is not linked to any external provider");

    const syncResB = await syncBankAccount({ accountId: accountMillenniumId });
    expect((syncResB?.data as any)?.error).not.toBe("Account is not linked to any external provider");
  });

  test("Editing disconnected account succeeds", async () => {
    await disconnectBank({ accountId: accountFranciscoId });

    // Editing disconnected Francisco account succeeds
    const editRes = await updateAccount({
      id: accountFranciscoId,
      type: "Benefits",
      balance: 123.45,
      currency: "EUR"
    });
    expect((editRes?.data as any)?.success).toBe(true);

    // Editing active Millennium account fails
    try {
       await updateAccount({
         id: accountMillenniumId,
         type: "Benefits",
         balance: 123.45,
         currency: "EUR"
       });
       expect(true).toBe(false);
    } catch (e: any) {
       expect(e.message).toContain("Cannot manually modify the balance of a bank-connected account.");
    }
  });

  test("Disconnecting Millennium (the last one) revokes the session", async () => {
    const { EnableBankingClient } = await import("@/lib/banking/enable-banking-client");
    
    await disconnectBank({ accountId: accountFranciscoId });
    vi.clearAllMocks();

    const result = await disconnectBank({ accountId: accountMillenniumId });
    expect(result?.data?.success).toBe(true);

    const mappingB = await db.externalAccountMapping.findUnique({ where: { id: mappingBId } });
    expect(mappingB?.disconnectedAt).not.toBeNull();

    // Verify revoke WAS called
    expect(EnableBankingClient.prototype.revokeSession).toHaveBeenCalledWith("session-1");

    // Verify connection becomes REVOKED
    const connection = await db.bankConnection.findUnique({ where: { id: connectionId } });
    expect(connection?.status).toBe("REVOKED");
  });

  test("Disconnecting Millennium fails if network error, leaves connection intact", async () => {
    const { EnableBankingClient } = await import("@/lib/banking/enable-banking-client");
    
    await disconnectBank({ accountId: accountFranciscoId });
    vi.clearAllMocks();

    // Mock network error
    (EnableBankingClient.prototype.revokeSession as any).mockRejectedValueOnce(new Error("Network Error"));

    try {
      await disconnectBank({ accountId: accountMillenniumId });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("network/application error");
    }

    // Verify mapping is still connected
    const mappingB = await db.externalAccountMapping.findUnique({ where: { id: mappingBId } });
    expect(mappingB?.disconnectedAt).toBeNull();

    // Verify connection remains CONNECTED
    const connection = await db.bankConnection.findUnique({ where: { id: connectionId } });
    expect(connection?.status).toBe("CONNECTED");
  });
});
