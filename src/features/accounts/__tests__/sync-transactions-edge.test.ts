import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncTransactions } from "../actions";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

vi.mock("@/lib/auth");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Transaction Synchronization Pagination", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.externalTransactionMapping.deleteMany();
    await db.transaction.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.bankConnection.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  it("handles empty page 1 with continuation key", async () => {
    await db.user.create({ data: { id: "user-1", email: "user-1@test.com", passwordHash: "h" } });
    const conn = await db.bankConnection.create({ data: { id: "conn-1", userId: "user-1", provider: "ENABLE_BANKING", providerSessionId: "s-1", institutionName: "T", institutionCountry: "PT", status: "CONNECTED" } });
    const acc = await db.account.create({ data: { id: "acc-1", userId: "user-1", name: "Acc", type: "Bank", balance: 100, currency: "EUR" } });
    await db.externalAccountMapping.create({ data: { bankConnectionId: conn.id, accountId: acc.id, providerAccountUid: "uid-1", identificationHash: "h-1" } });

    vi.mocked(auth.getUserId).mockResolvedValue("user-1");

    const getTxsMock = vi.spyOn(EnableBankingClient.prototype, "getTransactions")
      .mockResolvedValueOnce({
        continuationKey: "next-page",
        transactions: [],
        skippedInvalid: 0
      })
      .mockResolvedValueOnce({
        transactions: [{ dedupKey: "entry:1", amount: 10, currency: "EUR", date: new Date(), description: "T", creditDebitIndicator: "CREDIT", status: "BOOKED", remittanceInformation: [] } as any],
        skippedInvalid: 0
      });

    const res = await syncTransactions({ accountId: "acc-1" });
    
    // Expect it was called twice
    expect(getTxsMock).toHaveBeenCalledTimes(2);
    // Page 2 should have identical strategy/dateFrom but different continuationKey
    expect(getTxsMock).toHaveBeenNthCalledWith(1, "uid-1", expect.objectContaining({ strategy: "longest", dateFrom: undefined, continuationKey: undefined }));
    expect(getTxsMock).toHaveBeenNthCalledWith(2, "uid-1", expect.objectContaining({ strategy: "longest", dateFrom: undefined, continuationKey: "next-page" }));
    
    expect(res?.data?.imported).toBe(1);
    expect(res?.data?.pagesFetched).toBe(2);
  });
});
