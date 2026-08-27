import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStructuredImport } from '../structured-import-parser';

describe('Structured Import V2 Integration', () => {
  it('identifies V2 CSV correctly with only Direction (no DestinationAccount)', () => {
    const csvContent = `Date,Description,Direction,Amount,Account,Category
2026-08-01,Groceries,Debit,50,Main,Groceries
2026-08-02,Salary,Credit,1000,Main,Salary`;

    // Create a dummy workbook simulating what XLSX.read produces for CSV
    const ws = XLSX.read(csvContent, { type: 'string' }).Sheets.Sheet1;
    const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };

    const res = parseStructuredImport({ buffer: csvContent, fileName: 'export.csv' });
    
    expect(res.formatVersion).toBe(2);
    expect(res.importMode).toBe('TransactionsOnly');
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions![0].direction).toBe('Debit');
    expect(res.transactions![1].direction).toBe('Credit');
  });

  it('identifies V2 CSV correctly with Direction and DestinationAccount', () => {
    const csvContent = `Date,Description,Direction,Amount,Account,DestinationAccount
2026-08-01,Transfer to Savings,InternalTransfer,100,Main,Savings`;

    const res = parseStructuredImport({ buffer: csvContent, fileName: 'export.csv' });
    
    expect(res.formatVersion).toBe(2);
    expect(res.importMode).toBe('TransactionsOnly');
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions![0].direction).toBe('InternalTransfer');
    expect(res.transactions![0].destinationAccountName).toBe('Savings');
  });

  it('identifies V1 CSV (Legacy) correctly', () => {
    const csvContent = `Date,Description,Type,Amount,Account
2026-08-01,Groceries,Expense,50,Main`;

    const res = parseStructuredImport({ buffer: csvContent, fileName: 'legacy.csv' });
    
    expect(res.formatVersion).toBe(1);
    expect(res.importMode).toBe('TransactionsOnly');
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions![0].direction).toBe('Debit'); // Expense -> Debit
  });
});
