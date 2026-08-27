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
    it('should create an InternalTransfer and adjust both balances correctly', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => callback(mockDb));

      const mockTx = {
        id: 'tx-2',
        direction: 'InternalTransfer',
        amount: 200,
        accountId: 'acc-1',
        destinationAccountId: 'acc-2'
      };

      mockDb.transaction.create.mockResolvedValue(mockTx);
      mockDb.account.findUnique.mockImplementation(async (args: any) => {
        if (args.where.id === 'acc-1') return { id: 'acc-1', userId: 'test-user-id', externalMappings: [] };
        if (args.where.id === 'acc-2') return { id: 'acc-2', userId: 'test-user-id', externalMappings: [] };
        return null;
      });

      const result = await createTransaction({
        date: '2026-07-02',
        description: 'Internal Transfer test',
        direction: 'InternalTransfer',
        amount: 200,
        accountId: 'acc-1',
        destinationAccountId: 'acc-2'
      });

      expect(mockDb.transaction.create).toHaveBeenCalled();
      
      // Source account should decrement
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 200 } }
      });
      // Destination account should increment
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-2' },
        data: { balance: { increment: 200 } }
      });
      expect(result?.data?.success).toBe(true);
    });

    it('should reject InternalTransfer if destination is missing', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => callback(mockDb));

      const result = await createTransaction({
        date: '2026-07-02',
        description: 'Internal Transfer invalid',
        direction: 'InternalTransfer',
        amount: 200,
        accountId: 'acc-1',
        destinationAccountId: null
      });

      expect(result?.serverError || result?.validationErrors).toBeDefined();
    });

    it('should reject Debit if destination is provided', async () => {
      mockDb.$transaction.mockImplementation(async (callback: any) => callback(mockDb));

      const result = await createTransaction({
        date: '2026-07-02',
        description: 'Debit invalid',
        direction: 'Debit',
        amount: 200,
        accountId: 'acc-1',
        destinationAccountId: 'acc-2'
      });

      expect(result?.serverError || result?.validationErrors).toBeDefined();
    });

    it('should create a transaction and adjust balances correctly', async () => {
      // Mock the transaction to just execute the callback
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const mockTx = {
        id: 'tx-1',
        
        direction: 'Debit',
        amount: 100,
        accountId: 'acc-1'
      };

      mockDb.transaction.create.mockResolvedValue(mockTx);
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
      mockDb.account.update.mockResolvedValue({ id: 'acc-1', balance: 900 });

      const result = await createTransaction({
        date: '2026-07-01',
        description: 'Test Expense',
        direction: 'Debit',
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
        
        direction: 'Debit',
        amount: 50,
        accountId: 'acc-1',
        userId: 'test-user-id'
      };

      const updatedTx = {
        id: 'tx-1',
        
        direction: 'Debit',
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
        
        direction: 'Credit',
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
