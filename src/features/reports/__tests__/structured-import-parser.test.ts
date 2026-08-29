import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseStructuredImport } from "../structured-import-parser";

describe("structured-import-parser", () => {
  it("should parse Snapshots with malformed legacy headers correctly", () => {
    const wb = XLSX.utils.book_new();
    
    // Snapshots sheet with bad headers (trailing spaces, normal casing)
    const wsSnapshots = XLSX.utils.aoa_to_sheet([
      ["Year  ", "Month  ", "Net Worth ", "Liquid Assets ", "Investments  ", "Savings Rate "],
      [2026, 5, 18500, 5500, 13000, 22.5]
    ]);
    XLSX.utils.book_append_sheet(wb, wsSnapshots, "Snapshots");

    // We also need some accounts/transactions to be a valid generic sheet
    const wsAccounts = XLSX.utils.aoa_to_sheet([
      ["name", "type", "balance", "currency"],
      ["Main", "Bank", 100, "EUR"]
    ]);
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

    const buffer = XLSX.write(wb, { type: "binary" });

    const result = parseStructuredImport({ buffer, fileName: "test.xlsx" });

    expect(result.snapshots).toBeDefined();
    expect(result.snapshots![0]).toEqual({
      year: 2026,
      month: 5,
      netWorth: 18500,
      liquidAssets: 5500,
      investmentsValue: 13000,
      savingsRate: 22.5
    });
    
    // Verify preview-compatible property explicitly
    expect(result.snapshots![0].savingsRate).toBe(22.5);
  });

  it("should normalize legacy amounts and preserve Direction semantics", () => {
    const wb = XLSX.utils.book_new();
    const wsTransactions = XLSX.utils.aoa_to_sheet([
      ["date", "description", "type", "amount", "accountName", "categoryName", "tags", "notes"],
      ["2026-05-01", "Expense Example", "Expense", -35, "Main", "Food", "", ""],
      ["2026-05-02", "Income Example", "Income", 1200, "Main", "Salary", "", ""],
      ["2026-05-03", "Positive Expense", "Expense", 35, "Main", "Food", "", ""]
    ]);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");
    
    const buffer = XLSX.write(wb, { type: "binary" });
    const result = parseStructuredImport({ buffer, fileName: "test.xlsx" });
    
    expect(result.transactions).toBeDefined();
    expect(result.transactions![0].direction).toBe("Debit");
    expect(result.transactions![0].amount).toBe(35); // normalized to positive
    
    expect(result.transactions![1].direction).toBe("Credit");
    expect(result.transactions![1].amount).toBe(1200);

    expect(result.transactions![2].direction).toBe("Debit");
    expect(result.transactions![2].amount).toBe(35);
  });

  it("should preserve V2 backup parsing", () => {
    const wb = XLSX.utils.book_new();
    const wsTransactions = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Direction", "Amount", "Account", "DestinationAccount", "Category", "Tags", "Notes"],
      ["2026-05-01", "Out", "Debit", 35, "Main", "", "Food", "", ""],
      ["2026-05-02", "In", "Credit", 1200, "Main", "", "Salary", "", ""],
      ["2026-05-03", "Transfer", "InternalTransfer", 50, "Main", "Savings", "Transfer", "", ""]
    ]);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");
    
    // V2 Metadata
    const wsMetadata = XLSX.utils.aoa_to_sheet([
      ["FormatVersion"],
      [2]
    ]);
    XLSX.utils.book_append_sheet(wb, wsMetadata, "Metadata");

    const buffer = XLSX.write(wb, { type: "binary" });
    const result = parseStructuredImport({ buffer, fileName: "v2.xlsx" });

    expect(result.formatVersion).toBe(2);
    expect(result.transactions![0].direction).toBe("Debit");
    expect(result.transactions![0].amount).toBe(35);
    
    expect(result.transactions![1].direction).toBe("Credit");
    expect(result.transactions![1].amount).toBe(1200);
    
    expect(result.transactions![2].direction).toBe("InternalTransfer");
    expect(result.transactions![2].amount).toBe(50);
    expect(result.transactions![2].destinationAccountName).toBe("Savings");
  });
});
