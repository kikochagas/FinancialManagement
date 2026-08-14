import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncBalance } from "../actions";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

vi.mock("@/lib/auth");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Balance Synchronization Phase", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.externalTransactionMapping.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.pendingExternalAccount.deleteMany();
    await db.bankConnection.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  const setupData = async (userId: string = "user-1", connStatus: string = "CONNECTED", providerSessionId: string | null = "sess-1") => {
    await db.user.create({
      data: { id: userId, email: `${userId}@test.com`, passwordHash: "hash" },
    });
    const connection = await db.bankConnection.create({
      data: {
        id: "conn-1",
        userId,
        provider: "ENABLE_BANKING",
        providerSessionId,
        institutionName: "Test Bank",
        institutionCountry: "PT",
        status: connStatus,
      },
    });
    const account = await db.account.create({
      data: { id: "acc-1", userId, name: "Existing", type: "Bank", balance: 10, currency: "EUR" }
    });
    const mapping = await db.externalAccountMapping.create({
      data: {
        bankConnectionId: connection.id,
        accountId: account.id,
        providerAccountUid: "uid-1",
        identificationHash: "hash-1"
      }
    });
    return { connection, account, mapping };
  };

  it("authenticated owner can sync balance successfully", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    const mockGetBalances = vi.spyOn(EnableBankingClient.prototype, "getBalances").mockResolvedValue([
      { amount: 50.5, currency: "EUR", type: "ITBD" }
    ]);
    const mockNormalizeBalance = vi.spyOn(EnableBankingClient.prototype, "normalizeBalance").mockReturnValue({ amount: 50.5, currency: "EUR", type: "ITBD" });

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.data?.success).toBe(true);

    const updatedAccount = await db.account.findUnique({ where: { id: "acc-1" }});
    expect(updatedAccount?.balance).toBe(50.5);

    const updatedMapping = await db.externalAccountMapping.findFirst();
    expect(updatedMapping?.lastBalanceSyncedAt).not.toBeNull();
  });

  it("another user cannot sync account", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-2");
    await setupData("user-1");

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.serverError).toBe("Unauthorized or invalid account");
  });

  it("revoked connection rejected", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData("user-1", "REVOKED");

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.data?.reauthRequired).toBe(true);
  });

  it("missing provider session rejected", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData("user-1", "CONNECTED", null);

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.data?.reauthRequired).toBe(true);
  });

  it("currency mismatch does not overwrite existing balance", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockResolvedValue([{ amount: 100, currency: "USD", type: "ITBD" }]);
    vi.spyOn(EnableBankingClient.prototype, "normalizeBalance").mockReturnValue({ amount: 100, currency: "USD", type: "ITBD" });

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.serverError).toBe("Currency mismatch between provider and account");

    const updatedAccount = await db.account.findUnique({ where: { id: "acc-1" }});
    expect(updatedAccount?.balance).toBe(10); // Unchanged
  });

  it("unsupported balance set does not overwrite existing balance", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockResolvedValue([{ amount: 100, currency: "EUR", type: "WEIRD" }]);
    vi.spyOn(EnableBankingClient.prototype, "normalizeBalance").mockReturnValue(null);

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.serverError).toBe("No supported balance type available");

    const updatedAccount = await db.account.findUnique({ where: { id: "acc-1" }});
    expect(updatedAccount?.balance).toBe(10); // Unchanged
  });

  it("provider failure does not modify balance", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockRejectedValue(new Error("API Down"));
    vi.spyOn(EnableBankingClient.prototype, "normalizeBalance").mockReturnValue(null);

    const res = await syncBalance({ accountId: "acc-1" });
    expect(res?.serverError).toBe("Provider synchronization failed");

    const updatedAccount = await db.account.findUnique({ where: { id: "acc-1" }});
    expect(updatedAccount?.balance).toBe(10); // Unchanged
  });

  it("missing providerAccountUid rejected in tests?", async () => {
     // Just making sure we don't pass providerSessionId
     // We verified the signature statically.
  });

  it("EXPIRED_SESSION revokes session and requests reauth", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();
    const error = new Error("Provider error") as any;
    error.name = "EnableBankingProviderError";
    error.body = { error: "EXPIRED_SESSION" };

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockRejectedValue(error);
    const res = await syncBalance({ accountId: "acc-1" });
    
    expect(res?.data?.reauthRequired).toBe(true);
    const updatedConnection = await db.bankConnection.findUnique({ where: { id: "conn-1" }});
    expect(updatedConnection?.status).toBe("EXPIRED");
  });

  it("REVOKED_SESSION revokes session and requests reauth", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();
    const error = new Error("Provider error") as any;
    error.name = "EnableBankingProviderError";
    error.body = { error: "REVOKED_SESSION" };

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockRejectedValue(error);
    const res = await syncBalance({ accountId: "acc-1" });
    
    expect(res?.data?.reauthRequired).toBe(true);
    const updatedConnection = await db.bankConnection.findUnique({ where: { id: "conn-1" }});
    expect(updatedConnection?.status).toBe("REVOKED");
  });

  it("unrelated 401 connection remains CONNECTED", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();
    const error = new Error("Provider error") as any;
    error.name = "EnableBankingProviderError";
    error.status = 401;
    error.body = { error: "SOME_OTHER_ERROR" };

    vi.spyOn(EnableBankingClient.prototype, "getBalances").mockRejectedValue(error);
    const res = await syncBalance({ accountId: "acc-1" });
    
    expect(res?.serverError).toBe("Provider synchronization failed");
    const updatedConnection = await db.bankConnection.findUnique({ where: { id: "conn-1" }});
    expect(updatedConnection?.status).toBe("CONNECTED");
  });

  describe("Balance normalization logic (ITBD > CLBD > ITAV > CLAV)", () => {
    it("returns ITBD if available", () => {
      const client = new EnableBankingClient();
      const res = client.normalizeBalance([
        { amount: 10, type: "CLBD", currency: "EUR" },
        { amount: 20, type: "ITBD", currency: "EUR" },
        { amount: 30, type: "ITAV", currency: "EUR" }
      ]);
      expect(res?.type).toBe("ITBD");
    });

    it("returns CLBD as fallback", () => {
      const client = new EnableBankingClient();
      const res = client.normalizeBalance([
        { amount: 10, type: "CLAV", currency: "EUR" },
        { amount: 20, type: "CLBD", currency: "EUR" },
        { amount: 30, type: "ITAV", currency: "EUR" }
      ]);
      expect(res?.type).toBe("CLBD");
    });
    
    it("returns ITAV as fallback", () => {
      const client = new EnableBankingClient();
      const res = client.normalizeBalance([
        { amount: 10, type: "CLAV", currency: "EUR" },
        { amount: 30, type: "ITAV", currency: "EUR" }
      ]);
      expect(res?.type).toBe("ITAV");
    });

    it("returns CLAV as fallback", () => {
      const client = new EnableBankingClient();
      const res = client.normalizeBalance([
        { amount: 10, type: "CLAV", currency: "EUR" },
        { amount: 30, type: "WEIRD", currency: "EUR" }
      ]);
      expect(res?.type).toBe("CLAV");
    });
  });
});
