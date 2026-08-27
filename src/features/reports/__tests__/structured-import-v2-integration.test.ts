import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStructuredImport } from '../structured-import-parser';
import { importDataAction } from '../actions';
import { db } from '@/lib/db';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('Structured Import V2 Integration', () => {
  const mockDb = db as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves FullBackup balances when importing V2 workbook', async () => {
    // 1. Create a dummy V2 workbook
    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ FormatVersion: 2 }]), 'Metadata');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { name: 'A', balance: 1000, type: 'Checking' },
      { name: 'B', balance: 500, type: 'Savings' }
    ]), 'Accounts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Date: '2026-08-01', Description: 'Transfer', Direction: 'InternalTransfer', Amount: 100, Account: 'A', DestinationAccount: 'B', Category: 'Transfer' }
    ]), 'Transactions');
    
    // Convert to buffer
    const buffer = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });

    // 2. Parse using structured parser
    const parsed = parseStructuredImport({ buffer, fileName: 'backup.xlsx' });
    
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.importMode).toBe('FullBackup');

    // 3. Mock DB behavior for importDataAction
    mockDb.account.findMany.mockResolvedValue([]);
    let accIdCounter = 1;
    mockDb.account.create.mockImplementation((args: any) => Promise.resolve({ id: `acc-${accIdCounter++}`, name: args.data.name }));
    mockDb.category.findMany.mockResolvedValue([
      { id: 'cat-trans', name: 'Transfer' }
    ]);
    // Setup for $transaction
    mockDb.$transaction.mockImplementation(async (cb: any) => {
      return cb(mockDb);
    });

    // 4. Run server action
    const res = await importDataAction(parsed as any);
    
    expect(res?.data?.success).toBe(true);

    // Verify that the final created accounts have the EXACT balances provided in the workbook,
    // and that the transaction didn't unintentionally modify them (since it's a FullBackup).
    // Actually, `importDataAction` in FullBackup mode directly uses the provided balances
    // when creating the accounts, and skips `adjustBalances` or explicitly sets balances to
    // the snapshot state.
    
    // We check that account A was created with balance 1000 and B with 500
    const createAccountCalls = mockDb.account.create.mock.calls;
    const balances = createAccountCalls.map((c: any) => c[0].data.balance);
    expect(balances).toContain(1000);
    expect(balances).toContain(500);
    
    // We expect transaction to be created with InternalTransfer
    const createTxCalls = mockDb.transaction.create.mock.calls;
    expect(createTxCalls[0][0].data.direction).toBe('InternalTransfer');
    expect(createTxCalls[0][0].data.amount).toBe(100);
  });
});
