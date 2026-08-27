import { describe, it, expect } from 'vitest';
import { buildTransactionPayload } from "../utils";

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
