import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { createAccount, updateAccount, deleteAccount } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Accounts Actions', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('createAccount', () => {
    it('should create a new account in database', async () => {
      mockDb.account.create.mockResolvedValue({
        id: 'acc-1',
        name: 'New Bank',
        type: 'Bank',
        balance: 100,
        currency: 'EUR'
      });

      const res = await createAccount({
        name: 'New Bank',
        type: 'Bank',
        balance: 100,
        currency: 'EUR'
      });

      expect(mockDb.account.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user-id',
          name: 'New Bank',
          type: 'Bank',
          balance: 100,
          currency: 'EUR'
        }
      });
      expect(res?.data?.success).toBe(true);
    });
  });

  describe('updateAccount', () => {
    it('should update an existing account', async () => {
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', name: 'Updated Bank', userId: 'test-user-id' });
      mockDb.account.update.mockResolvedValue({ id: 'acc-1', name: 'Updated Bank' });

      await updateAccount({
        id: 'acc-1',
        name: 'Updated Bank'
      });

      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'Updated Bank' }
      });
    });
  });

  describe('deleteAccount', () => {
    it('should delete an account', async () => {
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id' });
      await deleteAccount({ id: 'acc-1' });

      expect(mockDb.account.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' }
      });
    });
  });
});
