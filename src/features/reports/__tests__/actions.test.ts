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
        direction: 'Credit' as const,
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

    it('should import InternalTransfer and correctly adjust balances', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const transactions = [
        {
          date: '2026-08-01',
          description: 'Transfer',
          direction: 'InternalTransfer' as const,
          amount: 500,
          accountName: 'Bank',
          destinationAccountName: 'Savings',
          categoryName: 'Transfer',
        }
      ];

      mockDb.category.findMany.mockResolvedValue([{ id: 'cat-trans', name: 'Transfer' }]);
      mockDb.account.findMany.mockResolvedValue([
        { id: 'acc-bank', name: 'Bank', balance: 1000 },
        { id: 'acc-save', name: 'Savings', balance: 500 }
      ]);
      
      const res = await importDataAction({ transactions });

      // Check transaction was created with destination
      expect(mockDb.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          direction: 'InternalTransfer',
          accountId: 'acc-bank',
          destinationAccountId: 'acc-save',
          amount: 500
        })
      }));

      // Check balances were adjusted (Bank -500, Savings +500)
      expect(mockDb.account.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'acc-bank' },
        data: { balance: { decrement: 500 } }
      }));
      expect(mockDb.account.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'acc-save' },
        data: { balance: { increment: 500 } }
      }));

      expect(res?.data?.success).toBe(true);
    });

    it('should not adjust balances in FullBackup mode', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const transactions = [
        {
          date: '2026-08-01',
          description: 'Transfer',
          direction: 'InternalTransfer' as const,
          amount: 500,
          accountName: 'Bank',
          destinationAccountName: 'Savings',
          categoryName: 'Transfer',
        }
      ];

      mockDb.category.findMany.mockResolvedValue([{ id: 'cat-trans', name: 'Transfer' }]);
      mockDb.account.findMany.mockResolvedValue([
        { id: 'acc-bank', name: 'Bank', balance: 1000 },
        { id: 'acc-save', name: 'Savings', balance: 500 }
      ]);
      
      const res = await importDataAction({ importMode: 'FullBackup', transactions });

      // Balances should not be updated
      expect(mockDb.account.update).not.toHaveBeenCalled();
      expect(res?.data?.success).toBe(true);
    });

    it('should throw error for invalid InternalTransfer', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const transactions = [
        {
          date: '2026-08-01',
          description: 'Transfer',
          direction: 'InternalTransfer' as const,
          amount: 500,
          accountName: 'Bank',
          // Missing destinationAccountName
          categoryName: 'Transfer',
        }
      ];

      const res = await importDataAction({ transactions });
      expect(res?.serverError).toBeDefined();
      expect(res?.serverError).toContain("Source and destination required for InternalTransfer");
    });
  });
});
