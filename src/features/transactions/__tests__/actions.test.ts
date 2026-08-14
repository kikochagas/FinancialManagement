import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { createTransaction, updateTransaction, deleteTransaction } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Transactions Actions', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('createTransaction', () => {
    it('should create a transaction and adjust balances correctly', async () => {
      // Mock the transaction to just execute the callback
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const mockTx = {
        id: 'tx-1',
        type: 'Expense',
        amount: 100,
        accountId: 'acc-1'
      };

      mockDb.transaction.create.mockResolvedValue(mockTx);
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
      mockDb.account.update.mockResolvedValue({ id: 'acc-1', balance: 900 });

      const result = await createTransaction({
        date: '2026-07-01',
        description: 'Test Expense',
        type: 'Expense',
        amount: 100,
        accountId: 'acc-1'
      });

      // Verify db.transaction.create was called
      expect(mockDb.transaction.create).toHaveBeenCalled();
      // Verify account balance was adjusted (decremented for Expense)
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 100 } }
      });
      expect(result?.data?.success).toBe(true);
    });
  });

  describe('updateTransaction', () => {
    it('should reverse old transaction and apply new transaction balances', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const oldTx = {
        id: 'tx-1',
        type: 'Expense',
        amount: 50,
        accountId: 'acc-1',
        userId: 'test-user-id'
      };

      const updatedTx = {
        id: 'tx-1',
        type: 'Expense',
        amount: 100,
        accountId: 'acc-1'
      };

      mockDb.transaction.findUnique.mockResolvedValue(oldTx);
      mockDb.transaction.update.mockResolvedValue(updatedTx);
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });

      await updateTransaction({
        id: 'tx-1',
        amount: 100
      });

      // Old expense was 50, so it should increment 50 to reverse
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: -50 } }
      });
      // New expense is 100, so it should decrement 100
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 100 } }
      });
    });
  });

  describe('deleteTransaction', () => {
    it('should restore balance when transaction is deleted', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const mockTx = {
        id: 'tx-1',
        type: 'Income',
        amount: 200,
        accountId: 'acc-1',
        userId: 'test-user-id'
      };

      mockDb.transaction.findUnique.mockResolvedValue(mockTx);
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });

      const res = await deleteTransaction({ id: 'tx-1' });
      console.log("Delete Tx Res:", res);

      // Income was 200, deleting it should decrement 200
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { increment: -200 } }
      });
      expect(mockDb.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'tx-1' }
      });
    });
  });
});
