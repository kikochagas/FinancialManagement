import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { ensureDefaultCategories } from '@/features/categories/default-categories';
import { classifyTransactions } from '../../bank-import/category-classifier';

vi.mock('@/lib/db', () => ({
  db: {
    category: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    }
  }
}));

vi.mock('@/features/categories/default-categories', () => ({
  ensureDefaultCategories: vi.fn(),
}));

const mockDb = db as any;

describe('Category Classifier (Deterministic)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    vi.mocked(ensureDefaultCategories).mockResolvedValue([
      // @ts-ignore
      // @ts-ignore
      { id: 'cat-salary', systemKey: 'salary', name: 'Salary' },
      { id: 'cat-withdrawal', systemKey: 'withdrawal', name: 'Withdrawal' },
      { id: 'cat-transfer', systemKey: 'transfer', name: 'Transfer' },
      { id: 'cat-fees', systemKey: 'fees', name: 'Fees' },
      { id: 'cat-tax', systemKey: 'tax', name: 'Tax' },
      { id: 'cat-interest', systemKey: 'interest', name: 'Interest' },
      { id: 'cat-investment', systemKey: 'investment', name: 'Investment' },
      { id: 'cat-purchase', systemKey: 'purchase', name: 'Purchase' },
      { id: 'cat-uncategorized', systemKey: 'uncategorized', name: 'Uncategorized' },
    ] as any);
  });

  it('classifies salary keywords correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'ordenado de maio', direction: 'Credit' as const },
      { candidateIndex: 1, description: 'PAYROLL INC', direction: 'Credit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-salary');
    expect(res[1]).toBe('cat-salary');
  });

  it('classifies withdrawal keywords correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'levantamento mb', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'ATM withdrawal', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-withdrawal');
    expect(res[1]).toBe('cat-withdrawal');
  });

  it('classifies transfer keywords correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'SEPA transfer', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'transferência', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-transfer');
    expect(res[1]).toBe('cat-transfer');
  });

  it('classifies fees correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'comissão de conta', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'account fee', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-fees');
    expect(res[1]).toBe('cat-fees');
  });

  it('classifies tax correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'IRS 2026', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'imposto', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-tax');
    expect(res[1]).toBe('cat-tax');
  });

  it('classifies interest correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'juros credores', direction: 'Credit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-interest');
  });

  it('classifies investment correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'broker deposit', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'investment fund', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-investment');
    expect(res[1]).toBe('cat-investment');
  });

  it('classifies purchase correctly', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'compra online', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'card payment', direction: 'Debit' as const },
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-purchase');
    expect(res[1]).toBe('cat-purchase');
  });

  it('classifies unknown description to canonical uncategorized', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'Random Merchant 123', direction: 'Debit' as const },
      { candidateIndex: 1, description: 'Uber Trip', direction: 'Debit' as const }, // Removed from global map
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-uncategorized');
    expect(res[1]).toBe('cat-uncategorized'); // Global map learning removed!
  });
  
  it('never modifies direction or queries history', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'salary', direction: 'Debit' as const }, // Salary but direction is Debit?
    ];
    
    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-salary'); // Classification just returns the category ID
    // ensure history query was NOT called (we didn't even mock it properly to return anything, so it would crash if it was called and not awaited / etc, but we want to assert it is never called)
    expect(mockDb.transaction.findMany).not.toHaveBeenCalled();
  });

  it('avoids accidental substring matches for short keywords', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'Coffee Shop', direction: 'Debit' as const }, // NOT Fees
      { candidateIndex: 1, description: 'Taxi ride', direction: 'Debit' as const }, // NOT Tax
      { candidateIndex: 2, description: 'First payment', direction: 'Debit' as const }, // NOT Tax (irs substring in first)
      { candidateIndex: 3, description: 'Account fee', direction: 'Debit' as const }, // Fees
      { candidateIndex: 4, description: 'IRS payment', direction: 'Debit' as const }, // Tax
    ];

    const res = await classifyTransactions('user-1', transactions);
    expect(res[0]).toBe('cat-uncategorized');
    expect(res[1]).toBe('cat-uncategorized');
    expect(res[2]).toBe('cat-uncategorized');
    expect(res[3]).toBe('cat-fees');
    expect(res[4]).toBe('cat-tax');
  });
});
