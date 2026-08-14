import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPendingAccountsForConnection } from "../queries";
import { linkAccounts } from "../actions";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Account Linking Phase", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.externalTransactionMapping.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.pendingExternalAccount.deleteMany();
    await db.bankConnection.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  const setupData = async (userId: string = "user-1") => {
    await db.user.create({
      data: { id: userId, email: `${userId}@test.com`, passwordHash: "hash" },
    });
    const connection = await db.bankConnection.create({
      data: {
        id: "conn-1",
        userId,
        provider: "ENABLE_BANKING",
        institutionName: "Test Bank",
        institutionCountry: "PT",
        status: "CONNECTED",
      },
    });
    return connection;
  };

  describe("Queries: getPendingAccountsForConnection", () => {
    it("unauthenticated user cannot view linking page", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue(null);
      await expect(getPendingAccountsForConnection("conn-1")).rejects.toThrow("Unauthorized");
    });

    it("user cannot view another user's BankConnection", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-evil");
      await setupData("user-real");
      await expect(getPendingAccountsForConnection("conn-1")).rejects.toThrow("Unauthorized");
    });

    it("expired PendingExternalAccount is not presented", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-exp",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "Expired Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() - 10000), // Expired
        }
      });
      
      const data = await getPendingAccountsForConnection("conn-1");
      expect(data.pendingAccounts).toHaveLength(0);
    });

    it("valid pending accounts are returned", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-valid",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "Valid Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000), // Valid
        }
      });
      
      const data = await getPendingAccountsForConnection("conn-1");
      expect(data.pendingAccounts).toHaveLength(1);
    });
  });

  describe("Actions: linkAccounts", () => {
    it("CREATE NEW ACCOUNT - creates Account, mapping, deletes pending, sets history null", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
          cashAccountType: "CACC",
        }
      });

      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "CREATE",
          name: "Created Acc" // user overrides display name
        }]
      });

      expect(res?.data?.success).toBe(true);

      const accounts = await db.account.findMany();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe("Created Acc");
      expect(accounts[0].balance).toBe(0);

      const mappings = await db.externalAccountMapping.findMany();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].accountId).toBe(accounts[0].id);
      expect(mappings[0].transactionImportFrom).toBeNull();

      const pendings = await db.pendingExternalAccount.findMany();
      expect(pendings).toHaveLength(0);
    });

    it("LINK EXISTING ACCOUNT - links account, defaults transactionImportFrom to link timestamp", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.account.create({
        data: { id: "acc-1", userId: "user-1", name: "Existing", type: "Bank", balance: 10, currency: "EUR" }
      });

      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "LINK",
          existingAccountId: "acc-1",
          importHistory: false
        }]
      });

      const mappings = await db.externalAccountMapping.findMany();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].accountId).toBe("acc-1");
      expect(mappings[0].transactionImportFrom).not.toBeNull();
      // Should be roughly now
      expect(mappings[0].transactionImportFrom?.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it("LINK EXISTING ACCOUNT - explicit historical import stores transactionImportFrom = null", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.account.create({
        data: { id: "acc-1", userId: "user-1", name: "Existing", type: "Bank", balance: 10, currency: "EUR" }
      });

      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "LINK",
          existingAccountId: "acc-1",
          importHistory: true
        }]
      });

      const mappings = await db.externalAccountMapping.findMany();
      expect(mappings[0].transactionImportFrom).toBeNull();
    });

    it("CONFLICTS - cannot link same existing account to a different external account", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.account.create({
        data: { id: "acc-1", userId: "user-1", name: "Existing", type: "Bank", balance: 10, currency: "EUR" }
      });

      await db.externalAccountMapping.create({
        data: {
          bankConnectionId: "conn-1",
          accountId: "acc-1",
          providerAccountUid: "old-uid",
          identificationHash: "old-hash"
        }
      });

      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "new-hash",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "LINK",
          existingAccountId: "acc-1"
        }]
      });

      expect(res?.serverError).toBe("Account already linked to a different external identity");
    });

    it("CONFLICTS - existing identificationHash mapping is reused/updated on reauthorization", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.account.create({
        data: { id: "acc-1", userId: "user-1", name: "Existing", type: "Bank", balance: 10, currency: "EUR" }
      });

      await db.externalAccountMapping.create({
        data: {
          bankConnectionId: "conn-1",
          accountId: "acc-1",
          providerAccountUid: "old-uid",
          identificationHash: "stable-hash"
        }
      });

      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "new-uid", // Changed
          identificationHash: "stable-hash", // Same
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "LINK",
          existingAccountId: "acc-1"
        }]
      });

      const mappings = await db.externalAccountMapping.findMany();
      expect(mappings).toHaveLength(1); // Did not duplicate
      expect(mappings[0].providerAccountUid).toBe("new-uid"); // Updated UID
      expect(mappings[0].accountId).toBe("acc-1");
    });

    it("SECURITY - refuses another user's account", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      await db.user.create({ data: { id: "user-2", email: "2", passwordHash: "h" }});
      
      await db.account.create({
        data: { id: "evil-acc", userId: "user-2", name: "Evil", type: "Bank", balance: 10, currency: "EUR" }
      });

      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "LINK",
          existingAccountId: "evil-acc"
        }]
      });

      expect(res?.serverError).toBe("Invalid existing account");
    });

    it("SECURITY - manipulated pendingAccountId from another user/connection is rejected", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      await db.user.create({ data: { id: "user-2", email: "2", passwordHash: "h" }});
      await db.bankConnection.create({
        data: { id: "conn-2", userId: "user-2", provider: "ENABLE_BANKING", institutionName: "T", institutionCountry: "T", status: "CONNECTED" },
      });
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-evil",
          bankConnectionId: "conn-2",
          providerAccountUid: "uid-2",
          identificationHash: "hash-2",
          displayName: "Evil Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
        }
      });

      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-evil",
          action: "CREATE",
          name: "Oops"
        }]
      });

      expect(res?.serverError).toBe("Invalid pending account");
    });

    it("IDEMPOTENCY - Double submission does not create duplicate mappings/accounts", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
          cashAccountType: "CACC"
        }
      });

      // First submit
      await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "CREATE",
          name: "Created Acc"
        }]
      });

      // Second submit with the same pendingAccountId which was deleted!
      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "CREATE",
          name: "Created Acc"
        }]
      });

      expect(res?.serverError).toBe("Invalid pending account");

      const accounts = await db.account.findMany();
      expect(accounts).toHaveLength(1);
      
      const mappings = await db.externalAccountMapping.findMany();
      expect(mappings).toHaveLength(1);
    });

    it("TYPE MAPPING - rejects unsupported account types automatically", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-1");
      await setupData("user-1");
      
      await db.pendingExternalAccount.create({
        data: {
          id: "pending-1",
          bankConnectionId: "conn-1",
          providerAccountUid: "uid-1",
          identificationHash: "hash-1",
          displayName: "My Acc",
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10000),
          cashAccountType: "WEIRD"
        }
      });

      const res = await linkAccounts({
        connectionId: "conn-1",
        selections: [{
          pendingAccountId: "pending-1",
          action: "CREATE",
          name: "Created Acc"
        }]
      });

      expect(res?.serverError).toContain("Unsupported account type");
    });
  });
});
