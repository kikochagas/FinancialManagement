import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncTransactions } from "../actions";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

vi.mock("@/lib/auth");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Transaction Synchronization Phase (Advanced)", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.externalTransactionMapping.deleteMany();
    await db.transaction.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.bankConnection.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  const setupData = async (userId: string = "user-1", connStatus: string = "CONNECTED") => {
    await db.user.create({ data: { id: userId, email: userId + "@test.com", passwordHash: "h" } });
    const conn = await db.bankConnection.create({
      data: { id: "conn-1", userId, provider: "ENABLE_BANKING", providerSessionId: "s-1", institutionName: "T", institutionCountry: "PT", status: connStatus },
    });
    const acc = await db.account.create({
      data: { id: "acc-1", userId, name: "Acc", type: "Bank", balance: 100, currency: "EUR" }
    });
    const mapping = await db.externalAccountMapping.create({
      data: { bankConnectionId: conn.id, accountId: acc.id, providerAccountUid: "uid-1", identificationHash: "h-1" }
    });
    return { conn, acc, mapping };
  };

  it("first new account uses longest, first existing uses transactionImportFrom", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    const { mapping } = await setupData();
    const getTxsMock = vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockResolvedValue({ transactions: [], skippedInvalid: 0 });

    await syncTransactions({ accountId: "acc-1" });
    expect(getTxsMock).toHaveBeenLastCalledWith("uid-1", expect.objectContaining({ strategy: "longest", dateFrom: undefined }));

    const importFrom = new Date("2024-01-01T00:00:00.000Z");
    await db.externalAccountMapping.update({ where: { id: mapping.id }, data: { transactionImportFrom: importFrom, lastTransactionSyncedAt: null } });

    await syncTransactions({ accountId: "acc-1" });
    expect(getTxsMock).toHaveBeenLastCalledWith("uid-1", expect.objectContaining({ strategy: "default", dateFrom: "2024-01-01" }));
  });

  it("last sync 30 days ago requests from lastSync - 7 days, NOT today - 7", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    const { mapping } = await setupData();
    const getTxsMock = vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockResolvedValue({ transactions: [], skippedInvalid: 0 });

    const lastSync = new Date("2024-05-10T00:00:00.000Z");
    await db.externalAccountMapping.update({ where: { id: mapping.id }, data: { lastTransactionSyncedAt: lastSync } });

    await syncTransactions({ accountId: "acc-1" });
    expect(getTxsMock).toHaveBeenLastCalledWith("uid-1", expect.objectContaining({ strategy: "default", dateFrom: "2024-05-03" }));
  });

  it("overlap never crosses transactionImportFrom", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    const { mapping } = await setupData();
    const getTxsMock = vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockResolvedValue({ transactions: [], skippedInvalid: 0 });

    const importFrom = new Date("2024-05-05T00:00:00.000Z");
    const lastSync = new Date("2024-05-10T00:00:00.000Z");
    await db.externalAccountMapping.update({ where: { id: mapping.id }, data: { transactionImportFrom: importFrom, lastTransactionSyncedAt: lastSync } });

    await syncTransactions({ accountId: "acc-1" });
    expect(getTxsMock).toHaveBeenLastCalledWith("uid-1", expect.objectContaining({ strategy: "default", dateFrom: "2024-05-05" }));
  });

  it("duplicate transaction on second sync is skipped, same entryReference on different mapping allowed", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    const { acc, mapping } = await setupData();
    
    const acc2 = await db.account.create({ data: { id: "acc-2", userId: "user-1", name: "Acc 2", type: "Bank", balance: 50, currency: "EUR" } });
    const mapping2 = await db.externalAccountMapping.create({ data: { bankConnectionId: mapping.bankConnectionId, accountId: acc2.id, providerAccountUid: "uid-2", identificationHash: "h-2" } });

    const tx = await db.transaction.create({ data: { userId: "user-1", accountId: acc.id, amount: 10, type: "Income", date: new Date(), description: "T", tags: "" }});
    await db.externalTransactionMapping.create({ data: { externalAccountMappingId: mapping.id, transactionId: tx.id, dedupKey: "entry:1" } });

    vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockResolvedValue({
      transactions: [
        { dedupKey: "entry:1", entryReference: "1", amount: 10, currency: "EUR", date: new Date(), description: "T", creditDebitIndicator: "CREDIT", status: "BOOKED", remittanceInformation: [] } as any
      ], skippedInvalid: 0
    });

    const res1 = await syncTransactions({ accountId: "acc-1" });
    expect(res1?.data?.duplicates).toBe(1);
    expect(res1?.data?.imported).toBe(0);

    const res2 = await syncTransactions({ accountId: "acc-2" });
    expect(res2?.data?.duplicates).toBe(0);
    expect(res2?.data?.imported).toBe(1);
  });

  it("currency mismatch skipped, invalid/non-BOOK skipped", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockResolvedValue({
      transactions: [
        { dedupKey: "entry:1", amount: 10, currency: "USD", date: new Date(), description: "T", creditDebitIndicator: "CREDIT", status: "BOOKED", remittanceInformation: [] } as any,
        { dedupKey: "entry:2", amount: 10, currency: "EUR", date: new Date(), description: "T", creditDebitIndicator: "CREDIT", status: "PENDING", remittanceInformation: [] } as any
      ], skippedInvalid: 0
    });

    const res = await syncTransactions({ accountId: "acc-1" });
    expect(res?.data?.skippedCurrencyMismatch).toBe(1);
    expect(res?.data?.skippedInvalid).toBe(1);
    expect(res?.data?.imported).toBe(0);
  });

  it("failed second pagination page does NOT update lastTransactionSyncedAt", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    const { mapping } = await setupData();

    vi.spyOn(EnableBankingClient.prototype, "getTransactions")
      .mockResolvedValueOnce({
        continuationKey: "page2",
        transactions: [{ dedupKey: "entry:1", amount: 10, currency: "EUR", date: new Date(), description: "T", creditDebitIndicator: "CREDIT", status: "BOOKED", remittanceInformation: [] } as any],
        skippedInvalid: 0
      })
      .mockRejectedValueOnce(new Error("Network Error"));

    const res = await syncTransactions({ accountId: "acc-1" });
    expect(res?.serverError).toBe("Provider synchronization failed");

    const updatedMap = await db.externalAccountMapping.findUnique({ where: { id: mapping.id } });
    expect(updatedMap?.lastTransactionSyncedAt).toBeNull();
  });

  it("handles provider errors safely (EXPIRED/REVOKED/unrelated)", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("user-1");
    await setupData();

    const errExpired = new Error("ProviderError") as any;
    errExpired.name = "EnableBankingProviderError";
    errExpired.body = { error: "EXPIRED_SESSION" };

    const getTxsMock = vi.spyOn(EnableBankingClient.prototype, "getTransactions").mockRejectedValue(errExpired);
    
    const res = await syncTransactions({ accountId: "acc-1" });
    expect(res?.data?.reauthRequired).toBe(true);
    let conn = await db.bankConnection.findFirst();
    expect(conn?.status).toBe("EXPIRED");

    errExpired.body.error = "REVOKED_SESSION";
    await db.bankConnection.update({ where: { id: conn!.id }, data: { status: "CONNECTED" }});
    const res2 = await syncTransactions({ accountId: "acc-1" });
    expect(res2?.data?.reauthRequired).toBe(true);
    conn = await db.bankConnection.findFirst();
    expect(conn?.status).toBe("REVOKED");

    errExpired.body.error = "API_DOWN"; // Unrelated
    await db.bankConnection.update({ where: { id: conn!.id }, data: { status: "CONNECTED" }});
    const res3 = await syncTransactions({ accountId: "acc-1" });
    expect(res3?.serverError).toBe("Provider synchronization failed");
    conn = await db.bankConnection.findFirst();
    expect(conn?.status).toBe("CONNECTED");
  });
});
