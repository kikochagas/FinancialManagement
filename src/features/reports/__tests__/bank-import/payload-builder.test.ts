import { describe, it, expect } from "vitest";
import { buildImportPayload } from "../../bank-import/payload-builder";
import { ParsedBankTransaction } from "../../bank-import/types";

describe("payload-builder", () => {
  it("builds the correct payload and wires currency", () => {
    const transactions: (ParsedBankTransaction & { import?: boolean, categoryId?: string })[] = [
      {
        bookingDate: "2026-08-12",
        description: "Test Transaction 1",
        amount: 100,
        direction: "Credit",
        valid: true,
        import: true,
        isProbableDuplicate: false,
        warnings: [],
        currencyConflict: false,
        currency: "EUR",
        sourceRow: 1
      },
      {
        bookingDate: "2026-08-13",
        description: "Test Transaction 2",
        amount: 50,
        direction: "Debit",
        valid: false, // Should be ignored
        import: true,
        isProbableDuplicate: false,
        warnings: ["Missing description"],
        currencyConflict: false,
        currency: "USD",
        sourceRow: 2
      },
      {
        bookingDate: "2026-08-14",
        description: "Test Transaction 3",
        amount: 25,
        direction: "Debit",
        valid: true,
        import: false, // Should be ignored
        isProbableDuplicate: false,
        warnings: [],
        currencyConflict: false,
        currency: "EUR",
        sourceRow: 3
      }
    ];

    const payload = buildImportPayload("acc_1", true, 1000, transactions);

    expect(payload.accountId).toBe("acc_1");
    expect(payload.updateBalance).toBe(true);
    expect(payload.endingBalance).toBe(1000);
    expect(payload.transactions).toHaveLength(1);

    expect(payload.transactions[0]).toEqual({
      bookingDate: "2026-08-12",
      description: "Test Transaction 1",
      amount: 100,
      direction: "Credit",
      categoryId: undefined,
      forceImportDuplicate: false,
      currency: "EUR"
    });
  });
});
