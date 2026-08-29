import { describe, it, expect } from 'vitest';
import { applyCategorySuggestionsAndFallbacks } from '../bank-import/category-fallback';

describe('BankImportWizard Category Fallback Logic', () => {
  it('A transaction without a category suggestion receives the real user\'s Uncategorized category ID', () => {
    const transactions: { id: number; description: string; categoryId?: string }[] = [{ id: 1, description: 'Unknown' }];
    const duplicates: number[] = [];
    const categoriesMap = { 0: null }; // no suggestion
    
    const categories = [
      { id: 'cat-salary', systemKey: 'salary', name: 'Salary' },
      { id: 'cat-purchase', systemKey: 'purchase', name: 'Purchase' },
      { id: 'cat-uncat', systemKey: 'uncategorized', name: 'Uncategorized' },
      { id: 'cat-custom', name: 'Custom Category' }, // no system key
    ];

    const result = applyCategorySuggestionsAndFallbacks(transactions, duplicates, categoriesMap, categories);

    expect(result[0].categoryId).toBe('cat-uncat');
    expect(result[0].isCategorySuggested).toBeUndefined(); // It's a fallback, not a suggestion
  });

  it('A valid classifier suggestion uses the corresponding real category ID', () => {
    const transactions: { id: number; description: string; categoryId?: string }[] = [{ id: 1, description: 'Payroll' }];
    const duplicates: number[] = [];
    const categoriesMap = { 0: 'cat-salary' };
    
    const categories = [
      { id: 'cat-salary', systemKey: 'salary', name: 'Salary' },
      { id: 'cat-uncat', systemKey: 'uncategorized', name: 'Uncategorized' },
    ];

    const result = applyCategorySuggestionsAndFallbacks(transactions, duplicates, categoriesMap, categories);

    expect(result[0].categoryId).toBe('cat-salary');
    expect(result[0].isCategorySuggested).toBe(true);
  });

  it('Does not override existing user category choices', () => {
    const transactions: { id: number; description: string; categoryId?: string }[] = [{ id: 1, description: 'Something', categoryId: 'cat-travel' }];
    const duplicates: number[] = [];
    const categoriesMap = { 0: 'cat-salary' };
    
    const categories = [
      { id: 'cat-salary', systemKey: 'salary', name: 'Salary' },
      { id: 'cat-uncat', systemKey: 'uncategorized', name: 'Uncategorized' },
      { id: 'cat-travel', systemKey: 'travel', name: 'Travel' },
    ];

    const result = applyCategorySuggestionsAndFallbacks(transactions, duplicates, categoriesMap, categories);

    expect(result[0].categoryId).toBe('cat-travel');
  });
});
