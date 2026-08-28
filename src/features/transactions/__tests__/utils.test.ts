import { describe, it, expect } from 'vitest';
import { buildTransactionPayload, getTransactionPerspective, filterTransactions } from "../utils";

describe("buildTransactionPayload", () => {
  it("preserves InternalTransfer and does not convert to Debit", () => {
    const payload = buildTransactionPayload({
      direction: "InternalTransfer",
      accountId: "acc-1",
      destinationAccountId: "acc-2",
      amount: "100",
      description: "Test transfer",
      date: "2026-08-26",
    });

    expect(payload.direction).toBe("InternalTransfer");
    expect(payload.destinationAccountId).toBe("acc-2");
    expect(payload.accountId).toBe("acc-1");
  });

  it("removes destinationAccountId if direction is Debit", () => {
    const payload = buildTransactionPayload({
      direction: "Debit",
      accountId: "acc-1",
      destinationAccountId: "acc-2", // should be ignored/nulled
      amount: "100",
      description: "Test debit",
      date: "2026-08-26",
    });

    expect(payload.direction).toBe("Debit");
    expect(payload.destinationAccountId).toBeNull();
  });
});


describe("getTransactionPerspective", () => {
  it("computes InternalTransfer perspective relative to account", () => {
    const tx = { direction: "InternalTransfer", accountId: "A", destinationAccountId: "B" };
    expect(getTransactionPerspective(tx, "A")).toEqual({ type: "outgoing", sign: "-", color: "text-foreground" });
    expect(getTransactionPerspective(tx, "B")).toEqual({ type: "incoming", sign: "+", color: "text-emerald-500 dark:text-emerald-400" });
    expect(getTransactionPerspective(tx, "all")).toEqual({ type: "neutral", sign: "⇄ ", color: "text-blue-500 dark:text-blue-400" });
  });

  it("handles normal Debits and Credits", () => {
    expect(getTransactionPerspective({ direction: "Credit", accountId: "A", destinationAccountId: "" }, "A")).toEqual({ type: "incoming", sign: "+", color: "text-emerald-500 dark:text-emerald-400" });
    expect(getTransactionPerspective({ direction: "Debit", accountId: "A", destinationAccountId: "" }, "A")).toEqual({ type: "outgoing", sign: "-", color: "text-foreground" });
  });
});

describe("filterTransactions", () => {
  const txs = [
    { id: "1", description: "tx 1", tags: "", direction: "InternalTransfer", accountId: "A", destinationAccountId: "B", categoryId: "cat1" },
    { id: "2", description: "tx 2", tags: "", direction: "Debit", accountId: "A", destinationAccountId: "", categoryId: "cat1" },
    { id: "3", description: "tx 3", tags: "", direction: "Credit", accountId: "B", destinationAccountId: "", categoryId: "cat2" },
  ];

  it("filters All Accounts correctly", () => {
    const res = filterTransactions(txs, { search: "", directionFilter: "all", accountFilter: "all", categoryFilter: "all" });
    expect(res).toHaveLength(3);
  });

  it("filters InternalTransfer for both accounts", () => {
    const resA = filterTransactions(txs, { search: "", directionFilter: "all", accountFilter: "A", categoryFilter: "all" });
    // tx 1 (IT A->B) and tx 2 (Debit A)
    expect(resA.map(t => t.id)).toEqual(["1", "2"]);

    const resB = filterTransactions(txs, { search: "", directionFilter: "all", accountFilter: "B", categoryFilter: "all" });
    // tx 1 (IT A->B) and tx 3 (Credit B)
    expect(resB.map(t => t.id)).toEqual(["1", "3"]);

    const resC = filterTransactions(txs, { search: "", directionFilter: "all", accountFilter: "C", categoryFilter: "all" });
    expect(resC).toHaveLength(0);
  });

  it("combines direction filters correctly with account filters", () => {
    // Account B + InternalTransfer -> should show tx 1
    const res1 = filterTransactions(txs, { search: "", directionFilter: "InternalTransfer", accountFilter: "B", categoryFilter: "all" });
    expect(res1.map(t => t.id)).toEqual(["1"]);

    // Account B + Credit -> should show tx 3
    const res2 = filterTransactions(txs, { search: "", directionFilter: "Credit", accountFilter: "B", categoryFilter: "all" });
    expect(res2.map(t => t.id)).toEqual(["3"]);

    // Account B + Debit -> should show nothing
    const res3 = filterTransactions(txs, { search: "", directionFilter: "Debit", accountFilter: "B", categoryFilter: "all" });
    expect(res3).toHaveLength(0);

    // Account A + Debit -> should show tx 2
    const res4 = filterTransactions(txs, { search: "", directionFilter: "Debit", accountFilter: "A", categoryFilter: "all" });
    expect(res4.map(t => t.id)).toEqual(["2"]);
  });
});
