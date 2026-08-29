import { describe, it, expect, vi } from 'vitest';
import { classifyTransactions } from '../bank-import/category-classifier';
import { ensureDefaultCategories } from '@/features/categories/default-categories';

// Mock DB
vi.mock('@/lib/db', () => ({
  db: {
    category: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('@/features/categories/default-categories', () => ({
  ensureDefaultCategories: vi.fn().mockResolvedValue([
        // @ts-ignore
        { id: 'cat-1', systemKey: 'salary', name: 'Salary', userId: 'user-1' },
        // @ts-ignore
        { id: 'cat-2', systemKey: 'uncategorized', name: 'Uncategorized', userId: 'user-1' },
        // @ts-ignore
        { id: 'cat-3', systemKey: 'purchase', name: 'Purchase', userId: 'user-1' },
  ])
}));

describe('Category Classifier & Dropdown Logic', () => {
  it('should map keywords to the correct user category ID', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'ACME Payroll', direction: 'Credit' as const },
      { candidateIndex: 1, description: 'Random Coffee', direction: 'Debit' as const },
      { candidateIndex: 2, description: 'Card Payment XYZ', direction: 'Debit' as const }
    ];
    
    const results = await classifyTransactions('user-1', transactions);
    
    expect(results[0]).toBe('cat-1'); // Salary
    expect(results[1]).toBe('cat-2'); // Uncategorized fallback
    expect(results[2]).toBe('cat-3'); // Purchase
  });

  it('should fallback to Uncategorized category ID if no keyword matches', async () => {
    const transactions = [
      { candidateIndex: 0, description: 'Unknown Transaction', direction: 'Debit' as const }
    ];
    
    const results = await classifyTransactions('user-1', transactions);
    
    expect(results[0]).toBe('cat-2'); // Uncategorized
  });
});
