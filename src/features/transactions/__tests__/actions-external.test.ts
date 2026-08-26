import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateTransaction, deleteTransaction, bulkDeleteTransactions, createTransaction } from "../actions";
import { updateAccount } from "../../accounts/actions";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Protected External Transactions and Accounts", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.externalTransactionMapping.deleteMany();
    await db.transaction.deleteMany();
    await db.category.deleteMany();
    await db.externalAccountMapping.deleteMany();
    await db.bankConnection.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  const setupData = async () => {
    await db.user.create({ data: { id: "u-1", email: "u-1@test.com", passwordHash: "h" } });
    await db.category.create({ data: { id: "cat-1", name: "Cat 1", userId: "u-1", color: "#000000" } });
    const normalAcc = await db.account.create({ data: { id: "a-normal", userId: "u-1", name: "Normal", type: "Cash", balance: 100 } });
    const linkedAcc = await db.account.create({ data: { id: "a-linked", userId: "u-1", name: "Linked", type: "Bank", balance: 100 } });
    const conn = await db.bankConnection.create({ data: { id: "c-1", userId: "u-1", provider: "ENABLE_BANKING", institutionName: "T", institutionCountry: "PT", status: "CONNECTED" } });
    const map = await db.externalAccountMapping.create({ data: { id: "m-1", bankConnectionId: conn.id, accountId: linkedAcc.id, providerAccountUid: "u", identificationHash: "h" } });
    
    const linkedTx = await db.transaction.create({ data: { id: "tx-linked", userId: "u-1", accountId: linkedAcc.id, date: new Date(), description: "D", direction: "Credit", amount: 50, tags: "" } });
    await db.externalTransactionMapping.create({ data: { externalAccountMappingId: map.id, transactionId: linkedTx.id, dedupKey: "entry:1" } });
    
    const normalTx = await db.transaction.create({ data: { id: "tx-normal", userId: "u-1", accountId: normalAcc.id, date: new Date(), description: "D2", direction: "Debit", amount: 20, tags: "" } });

    return { normalAcc, linkedAcc, linkedTx, normalTx };
  };

  it("accepts category-only or notes-only updates on linked tx", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    const res = await updateTransaction({ id: "tx-linked", categoryId: "cat-1", notes: "new note" });
    if (res?.serverError) throw new Error(res.serverError);

    const updated = await db.transaction.findUnique({ where: { id: "tx-linked" } });
    expect(updated?.categoryId).toBe("cat-1");
    expect(updated?.notes).toBe("new note");
  });

  it("rejects amount, date, description, account updates on linked tx", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    let res = await updateTransaction({ id: "tx-linked", amount: 100 });
    expect(res?.serverError).toContain("Cannot edit bank-controlled fields");
    
    res = await updateTransaction({ id: "tx-linked", date: "2024-01-01" });
    expect(res?.serverError).toContain("Cannot edit bank-controlled fields");
    
    res = await updateTransaction({ id: "tx-linked", description: "Hacked" });
    expect(res?.serverError).toContain("Cannot edit bank-controlled fields");
    
    res = await updateTransaction({ id: "tx-linked", accountId: "a-normal" });
    expect(res?.serverError).toContain("Cannot edit bank-controlled fields");
  });

  it("allows normal tx updates", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    await updateTransaction({ id: "tx-normal", amount: 100 });
    const updated = await db.transaction.findUnique({ where: { id: "tx-normal" } });
    expect(updated?.amount).toBe(100);
  });

  it("rejects deletion of linked tx", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    const res = await deleteTransaction({ id: "tx-linked" });
    expect(res?.serverError).toBe("Bank-synced transactions cannot be deleted.");
  });

  it("rejects bulk deletion if any is protected", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    const res = await bulkDeleteTransactions({ ids: ["tx-linked", "tx-normal"] });
    expect(res?.serverError).toBe("Bank-synced transactions cannot be deleted.");
    
    // Normal should still exist since it's atomic
    const stillExists = await db.transaction.findUnique({ where: { id: "tx-normal" } });
    expect(stillExists).toBeDefined();
  });

  it("manual transaction on normal account adjusts balance", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Credit", accountId: "a-normal" });
    const acc = await db.account.findUnique({ where: { id: "a-normal" } });
    expect(acc?.balance).toBe(150); // 100 + 50
  });

  it("rejects manual transactions (income/expense) on linked account", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    let res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Credit", accountId: "a-linked" });
    expect(res?.serverError).toContain("managed by bank synchronization");
    
    res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Debit", accountId: "a-linked" });
    expect(res?.serverError).toContain("managed by bank synchronization");
  });

  it("rejects transfers involving linked source or destination", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    let res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Debit", accountId: "a-linked", destinationAccountId: "a-normal" });
    expect(res?.serverError).toContain("managed by bank synchronization");
    
    res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Debit", accountId: "a-normal", destinationAccountId: "a-linked" });
    expect(res?.serverError).toContain("managed by bank synchronization");
  });

  it("rejects manual balance editing on linked account", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    let res = await updateAccount({ id: "a-linked", balance: 500 });
    expect(res?.serverError).toContain("Cannot manually modify the balance of a bank-connected account");
    
    // But allows name updates
    await updateAccount({ id: "a-linked", name: "New Name" });
    const acc = await db.account.findUnique({ where: { id: "a-linked" } });
    expect(acc?.name).toBe("New Name");
  });

  it("rejects using another user's account for create", async () => {
    await setupData();
    vi.mocked(auth.getUserId).mockResolvedValue("u-2");
    await db.user.create({ data: { id: "u-2", email: "u-2@test.com", passwordHash: "h" } });

    let res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Credit", accountId: "a-normal" });
    expect(res?.serverError).toContain("Invalid or unauthorized account");
    
    res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Debit", accountId: "a-normal", destinationAccountId: "a-linked" });
    expect(res?.serverError).toContain("Invalid or unauthorized account");
  });

  it("rejects using another user's category", async () => {
    await setupData();
    vi.mocked(auth.getUserId).mockResolvedValue("u-2");
    await db.user.create({ data: { id: "u-2", email: "u-2@test.com", passwordHash: "h" } });
    await db.account.create({ data: { id: "a-u2", userId: "u-2", name: "Acc", type: "Cash", balance: 0 }});

    // cat-1 is owned by u-1
    let res = await createTransaction({ date: new Date().toISOString(), description: "Test", amount: 50, direction: "Credit", accountId: "a-u2", categoryId: "cat-1" });
    expect(res?.serverError).toContain("Invalid or unauthorized category");

    // Also update
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    // Let's create cat-2 owned by u-2
    await db.category.create({ data: { id: "cat-2", name: "Cat 2", userId: "u-2", color: "#000000" } });
    
    let res2 = await updateTransaction({ id: "tx-normal", categoryId: "cat-2" });
    expect(res2?.serverError).toContain("Invalid or unauthorized category");

    // Also update bank-synced
    let res3 = await updateTransaction({ id: "tx-linked", categoryId: "cat-2" });
    expect(res3?.serverError).toContain("Invalid or unauthorized category");
  });

  it("historical transaction edited after linking -> linked balance unchanged", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    // Create a historical transaction (pretend it was created before linking)
    const tx = await db.transaction.create({ data: { userId: "u-1", accountId: "a-linked", date: new Date(), description: "Old", direction: "Debit", amount: 10, tags: "" } });

    // Update it
    await updateTransaction({ id: tx.id, amount: 20 });
    const acc = await db.account.findUnique({ where: { id: "a-linked" } });
    expect(acc?.balance).toBe(100); // Unchanged!
  });

  it("historical transaction deleted after linking -> linked balance unchanged", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    const tx = await db.transaction.create({ data: { userId: "u-1", accountId: "a-linked", date: new Date(), description: "Old", direction: "Debit", amount: 10, tags: "" } });

    await deleteTransaction({ id: tx.id });
    const acc = await db.account.findUnique({ where: { id: "a-linked" } });
    expect(acc?.balance).toBe(100); // Unchanged!
  });

  it("legacy transfer with linked source + manual dest -> only manual side adjusts", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue("u-1");
    await setupData();

    const tx = await db.transaction.create({ data: { userId: "u-1", accountId: "a-linked", destinationAccountId: "a-normal", date: new Date(), description: "Transfer", direction: "Debit", amount: 10, tags: "" } });

    // Change amount from 10 to 20
    // Expected:
    // a-linked (source) skips balance updates (remains 100)
    // a-normal (dest) reverses +10 -> -10, then applies +20 -> total +10
    // a-normal was 100, so it should be 110.
    await updateTransaction({ id: tx.id, amount: 20 });
    
    const accLinked = await db.account.findUnique({ where: { id: "a-linked" } });
    const accNormal = await db.account.findUnique({ where: { id: "a-normal" } });
    expect(accLinked?.balance).toBe(100);
    expect(accNormal?.balance).toBe(110);
  });
});
