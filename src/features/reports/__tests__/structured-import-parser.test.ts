import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStructuredImport } from '../structured-import-parser';

describe('Structured Import Parser', () => {
  it('should parse an Excel V2 FullBackup correctly', () => {
    const wb = XLSX.utils.book_new();

    // Metadata
    const wsMetadata = XLSX.utils.json_to_sheet([{ FormatVersion: 2 }]);
    XLSX.utils.book_append_sheet(wb, wsMetadata, "Metadata");

    // Accounts
    const wsAccounts = XLSX.utils.json_to_sheet([
      { name: 'Bank', type: 'Bank', balance: 1000, currency: 'EUR' }
    ]);
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

    // Transactions
    const wsTransactions = XLSX.utils.json_to_sheet([
      {
        Date: '2026-08-01',
        Description: 'Salary',
        Direction: 'Credit',
        Amount: 2000,
        Account: 'Bank',
        Category: 'Salary',
      },
      {
        Date: '2026-08-02',
        Description: 'Transfer',
        Direction: 'InternalTransfer',
        Amount: 100,
        Account: 'Bank',
        DestinationAccount: 'Savings',
        Category: 'Transfer'
      }
    ]);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");

    // Investments
    const wsInvestments = XLSX.utils.json_to_sheet([
      { name: 'Stock', type: 'Stocks', marketValue: 500 }
    ]);
    XLSX.utils.book_append_sheet(wb, wsInvestments, "Investments");

    // Goals
    const wsGoals = XLSX.utils.json_to_sheet([
      { name: 'House', type: 'House', targetAmount: 50000, currentAmount: 1000 }
    ]);
    XLSX.utils.book_append_sheet(wb, wsGoals, "Goals");

    // Write to array buffer
    const buffer = XLSX.write(wb, { type: 'binary' });

    const result = parseStructuredImport({ buffer, fileName: 'export.xlsx' });

    expect(result.formatVersion).toBe(2);
    expect(result.importMode).toBe('FullBackup');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts![0].name).toBe('Bank');

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions![0].direction).toBe('Credit');
    expect(result.transactions![1].direction).toBe('InternalTransfer');
    expect(result.transactions![1].destinationAccountName).toBe('Savings');
    expect(result.transactions![1].categoryName).toBe('Transfer'); // Preserved

    expect(result.investments).toHaveLength(1);
    expect(result.goals).toHaveLength(1);
  });

  it('should set missing categories to Uncategorized in V2', () => {
    const wb = XLSX.utils.book_new();
    const wsMetadata = XLSX.utils.json_to_sheet([{ FormatVersion: 2 }]);
    XLSX.utils.book_append_sheet(wb, wsMetadata, "Metadata");
    const wsTransactions = XLSX.utils.json_to_sheet([
      { Date: '2026-08-01', Description: 'Unknown', Direction: 'Debit', Amount: 50 }
    ]);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");
    const buffer = XLSX.write(wb, { type: 'binary' });

    const result = parseStructuredImport({ buffer, fileName: 'export.xlsx' });
    expect(result.transactions![0].categoryName).toBe('Uncategorized');
  });
});
