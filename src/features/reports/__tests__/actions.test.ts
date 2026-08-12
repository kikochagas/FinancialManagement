import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { importDataAction } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Reports Actions', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('importDataAction', () => {
    it('should import mapped transactions and accounts in a single transaction', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const transactions = [{
        date: '2026-07-01',
        description: 'Salary',
        type: 'Income',
        amount: 2000,
        accountName: 'Bank',
        categoryName: 'Salary',
        tags: '',
        notes: ''
      }];

      const accounts = [{
        name: 'New Bank',
        type: 'Bank',
        balance: 100,
        currency: 'EUR'
      }];

      mockDb.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Salary' }]);
      mockDb.account.findMany.mockResolvedValue([{ id: 'acc-1', name: 'Bank' }]);

      const res = await importDataAction({ transactions, accounts });

      // Verify transaction creation
      expect(mockDb.transaction.create).toHaveBeenCalled();
      // Verify account creation or update
      expect(mockDb.account.create).toHaveBeenCalled();
      
      expect(res?.data?.success).toBe(true);
    });
  });
});
