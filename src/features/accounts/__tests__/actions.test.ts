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
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', name: 'Updated Bank', userId: 'test-user-id', externalMappings: [] });
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

    it('rejects changes to balance, currency, or type on linked account', async () => {
      mockDb.account.findUnique.mockResolvedValue({ 
        id: 'acc-1', name: 'Bank', userId: 'test-user-id', balance: 100, currency: 'EUR', type: 'Bank',
        externalMappings: [{ id: 'm-1' }] 
      });

      let res = await updateAccount({ id: 'acc-1', balance: 200 });
      expect(res?.serverError).toContain("Cannot manually modify the balance of a bank-connected account");
      
      let res2 = await updateAccount({ id: 'acc-1', currency: 'USD' });
      expect(res2?.serverError).toContain("Cannot manually modify the currency of a bank-connected account");
      
      let res3 = await updateAccount({ id: 'acc-1', type: 'Cash' });
      expect(res3?.serverError).toContain("Cannot manually modify the type of a bank-connected account");

      // But allows name updates
      mockDb.account.update.mockResolvedValue({ id: 'acc-1', name: 'New Name' });
      let res4 = await updateAccount({ id: 'acc-1', name: 'New Name' });
      expect(res4?.data?.success).toBe(true);
    });
  });

  describe('deleteAccount', () => {
    it('should delete an account', async () => {
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
      const res = await deleteAccount({ id: 'acc-1' });
      console.log("Delete Account Res:", res);

      expect(mockDb.account.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' }
      });
    });
  });
});
