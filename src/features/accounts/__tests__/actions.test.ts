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

    it('should allow creating multiple Benefits accounts with different names', async () => {
      mockDb.account.create.mockResolvedValue({ id: 'acc-1', name: 'Meal', type: 'Benefits', balance: 0, currency: 'EUR' });
      const res1 = await createAccount({ name: 'Meal', type: 'Benefits', balance: 0, currency: 'EUR' });
      expect(res1?.data?.success).toBe(true);
      
      mockDb.account.create.mockResolvedValue({ id: 'acc-2', name: 'Flex', type: 'Benefits', balance: 0, currency: 'EUR' });
      const res2 = await createAccount({ name: 'Flex', type: 'Benefits', balance: 0, currency: 'EUR' });
      expect(res2?.data?.success).toBe(true);
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
        externalMappings: [{ id: 'm-1', disconnectedAt: null }] 
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
      // No financial deps
      mockDb.investmentEvent.count.mockResolvedValue(0);
      mockDb.investment.count.mockResolvedValue(0);
      mockDb.investmentAccountSnapshot.count.mockResolvedValue(0);
      const res = await deleteAccount({ id: 'acc-1' });
      console.log("Delete Account Res:", res);

      expect(mockDb.account.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' }
      });
    });

    it('blocks deletion when InvestmentEvents exist', async () => {
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
      mockDb.investmentEvent.count.mockResolvedValue(5);
      mockDb.investment.count.mockResolvedValue(0);
      mockDb.investmentAccountSnapshot.count.mockResolvedValue(0);
      const res = await deleteAccount({ id: 'acc-1' });
      expect(res?.serverError).toContain('financial history');
      expect(mockDb.account.delete).not.toHaveBeenCalled();
    });

    it('blocks deletion when Investments exist', async () => {
      mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
      mockDb.investmentEvent.count.mockResolvedValue(0);
      mockDb.investment.count.mockResolvedValue(2);
      mockDb.investmentAccountSnapshot.count.mockResolvedValue(0);
      const res = await deleteAccount({ id: 'acc-1' });
      expect(res?.serverError).toContain('financial history');
      expect(mockDb.account.delete).not.toHaveBeenCalled();
    });

    it('blocks deletion when broker snapshots exist', async () => {
      mockDb.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'test-user-id',
        externalMappings: [],
      });

      mockDb.investmentEvent.count.mockResolvedValue(0);
      mockDb.investment.count.mockResolvedValue(0);
      mockDb.investmentAccountSnapshot.count.mockResolvedValue(1);

      const res = await deleteAccount({ id: 'acc-1' });

      expect(res?.serverError).toContain('financial history');
      expect(mockDb.account.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateAccount — accounts with financial history remain editable', () => {
    it('allows name update on account that has InvestmentEvents', async () => {
      mockDb.account.findUnique.mockResolvedValue({
        id: 'acc-broker', name: 'My Broker', userId: 'test-user-id',
        externalMappings: []
      });
      mockDb.account.update.mockResolvedValue({ id: 'acc-broker', name: 'Renamed Broker' });

      const res = await updateAccount({ id: 'acc-broker', name: 'Renamed Broker' });
      // Must succeed — the deletion guard must NOT be present in updateAccount
      expect(res?.data?.success).toBe(true);
      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-broker' },
        data: { name: 'Renamed Broker' },
      });
    });

    it('allows balance update on account that has Investments (unlinked)', async () => {
      mockDb.account.findUnique.mockResolvedValue({
        id: 'acc-broker', name: 'My Broker', userId: 'test-user-id',
        balance: 1000, currency: 'EUR', type: 'Broker',
        externalMappings: [] // not bank-linked, so balance update is allowed
      });
      mockDb.account.update.mockResolvedValue({ id: 'acc-broker', balance: 2000 });

      const res = await updateAccount({ id: 'acc-broker', balance: 2000 });
      expect(res?.data?.success).toBe(true);
    });
  });
});
