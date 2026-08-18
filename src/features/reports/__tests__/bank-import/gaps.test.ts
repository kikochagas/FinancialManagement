import { describe, it, expect } from "vitest";
import { buildTransactions } from "../../bank-import/transaction-builder";
import { validateTransaction } from "../../bank-import/validation";
import { parseMoneyStrict } from "../../bank-import/money-parser";
import { resolveAmount } from "../../bank-import/normalization";
import { parseDateStrict } from "../../bank-import/date-parser";

describe("Bank Import Strict Requirements", () => {
  it("Strict money parsing rejects non-money strings and embedded currencies", () => {
    expect(parseMoneyStrict("abc123").valid).toBe(false);
    expect(parseMoneyStrict("TOTAL 500").valid).toBe(false);
    expect(parseMoneyStrict("12/08/2026").valid).toBe(false);
    expect(parseMoneyStrict("12abc").valid).toBe(false);
    expect(parseMoneyStrict("12/34").valid).toBe(false);
    expect(parseMoneyStrict("1.2.3").valid).toBe(false);
    expect(parseMoneyStrict("12EUR34").valid).toBe(false);
    expect(parseMoneyStrict("1USD2").valid).toBe(false);
    expect(parseMoneyStrict("€12€34").valid).toBe(false);
    expect(parseMoneyStrict("EUR12USD").valid).toBe(false);
    expect(parseMoneyStrict("12abc34").valid).toBe(false);
  });

  it("Strict money parsing accepts anchored formats and extracts currency", () => {
    expect(parseMoneyStrict("-14,74 €").value).toBe(-14.74);
    expect(parseMoneyStrict("-14,74 €").currency).toBe("EUR");
    
    expect(parseMoneyStrict("1.657,60 €").value).toBe(1657.60);
    expect(parseMoneyStrict("-4.000,00").value).toBe(-4000.00);
    expect(parseMoneyStrict("1,657.60").value).toBe(1657.60);
    expect(parseMoneyStrict("14.74").value).toBe(14.74);

    expect(parseMoneyStrict("€ 12,34").value).toBe(12.34);
    expect(parseMoneyStrict("12,34 €").value).toBe(12.34);
    expect(parseMoneyStrict("EUR 12,34").value).toBe(12.34);
    expect(parseMoneyStrict("12,34 EUR").value).toBe(12.34);
    expect(parseMoneyStrict("USD 10.50").value).toBe(10.50);
    expect(parseMoneyStrict("10.50 USD").value).toBe(10.50);
    expect(parseMoneyStrict("10.50 USD").currency).toBe("USD");
  });

  it("Strict date parsing rejects unanchored dates", () => {
    expect(parseDateStrict("2026-08-12garbage").valid).toBe(false);
    expect(parseDateStrict("14/08/2026garbage").valid).toBe(false);
    expect(parseDateStrict("2026-08-12 10:00").valid).toBe(false);
    expect(parseDateStrict("2026-08-12abc").valid).toBe(false);
    expect(parseDateStrict("2026-08-12").valid).toBe(true);
    expect(parseDateStrict("14/08/2026").valid).toBe(true);
  });

  it("Malformed transaction retained for Review rather than classified footer", () => {
    const rows = [
      ["Date", "Desc", "Amount"],
      ["31/02/2026", "Card purchase", "abc"]
    ];
    const mapping: any = {
      0: { semantic: "BOOKING_DATE", columnIndex: 0 },
      1: { semantic: "DESCRIPTION", columnIndex: 1 },
      2: { semantic: "AMOUNT", columnIndex: 2 }
    };
    const { transactions, footerRowsSkipped } = buildTransactions(rows, 0, mapping);
    expect(footerRowsSkipped).toBe(0);
    expect(transactions.length).toBe(1);
    expect(transactions[0].valid).toBe(false); // Retained but invalid
  });

  it("Blank rows do not increment footer count, text in BOOKING_DATE is skipped footer", () => {
    const rows = [
      ["Date", "Desc", "Amount"],
      ["2026-08-12", "Valid", "10"],
      ["", "", ""], // Blank
      [null, undefined, ""], // Blank
      ["Data de impressão: 12/08", "", ""] // Footer in BOOKING_DATE
    ];
    const mapping: any = {
      0: { semantic: "BOOKING_DATE", columnIndex: 0 },
      1: { semantic: "DESCRIPTION", columnIndex: 1 },
      2: { semantic: "AMOUNT", columnIndex: 2 }
    };
    const { footerRowsSkipped, transactions, blankRowsIgnored } = buildTransactions(rows, 0, mapping);
    expect(footerRowsSkipped).toBe(1); // Only the actual footer text row
    expect(blankRowsIgnored).toBe(2);
    expect(transactions.length).toBe(1);
  });

  it("Unsigned amount + Type resolution", () => {
    const rows = [
      ["Date", "Desc", "Valor", "Tipo"],
      ["2026-08-12", "Test", "128.00", "Débito"], // Unsigned + Débito -> Expense
      ["2026-08-12", "Test", "128.00", "Crédito"], // Unsigned + Crédito -> Income
      ["2026-08-12", "Test", "-128.00", "Crédito"], // Explicit negative + Crédito -> Conflict
      ["2026-08-12", "Test", "+128.00", "Débito"] // Explicit positive + Débito -> Conflict
    ];
    const mapping: any = {
      0: { semantic: "BOOKING_DATE", columnIndex: 0 },
      1: { semantic: "DESCRIPTION", columnIndex: 1 },
      2: { semantic: "AMOUNT", columnIndex: 2 },
      3: { semantic: "TYPE", columnIndex: 3 }
    };
    const { transactions } = buildTransactions(rows, 0, mapping);
    
    expect(transactions[0].type).toBe("Expense");
    expect(transactions[0].amount).toBe(128.00);
    
    expect(transactions[1].type).toBe("Income");
    expect(transactions[1].amount).toBe(128.00);
    
    expect(transactions[2].type).toBe(null); // Conflict
    expect(transactions[2].warnings.some(w => w.includes("conflict") || w.includes("Conflict"))).toBe(true);

    expect(transactions[3].type).toBe(null); // Conflict
    expect(transactions[3].warnings.some(w => w.includes("conflict") || w.includes("Conflict"))).toBe(true);
  });

  it("Debit + Credit both populated -> review", () => {
    const { type, warnings } = resolveAmount(undefined, "10", "20");
    expect(type).toBe(null);
    expect(warnings.some(w => w.includes("Both Debit and Credit"))).toBe(true);
  });
});
