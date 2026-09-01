import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { createInvestment, updateInvestment } from '../actions';

vi.mock('@/lib/db', async () => {
  const mod = await vi.importActual<any>('vitest-mock-extended');
  return { db: mod.mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('Investments Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateInvestment', () => {
    it('should calculate profit when updating investment', async () => {
      const mockDb = db as any;
      mockDb.investment.findUnique.mockResolvedValue({ costBasis: 1000, marketValue: 1000, userId: 'test-user-id' });
      mockDb.investment.update.mockResolvedValue({ id: 'inv-1' });
      mockDb.investment.findMany.mockResolvedValue([]);

      await updateInvestment({
        id: 'inv-1',
        marketValue: 1500
      });

      expect(mockDb.investment.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ marketValue: 1500, profit: 500 }) // 1500 - 1000
      }));
    });
  });

  describe('account ownership', () => {
    it('allows creating an investment linked to an owned account', async () => {
      const mockDb = db as any;

      mockDb.account.findUnique.mockResolvedValue({
        id: 'account-1',
        userId: 'test-user-id',
      });

      mockDb.investment.create.mockResolvedValue({
        id: 'inv-1',
        userId: 'test-user-id',
        accountId: 'account-1',
        name: 'Test Asset',
        type: 'Stocks',
        symbol: 'TEST',
        quantity: 1,
        costBasis: 100,
        marketValue: 120,
        profit: 20,
        allocation: 0,
      });

      mockDb.investment.findMany.mockResolvedValue([]);

      const res = await createInvestment({
        name: 'Test Asset',
        type: 'Stocks',
        symbol: 'TEST',
        accountId: 'account-1',
        quantity: 1,
        costBasis: 100,
        marketValue: 120,
      });

      expect(res?.data?.success).toBe(true);

      expect(mockDb.investment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'test-user-id',
          accountId: 'account-1',
          profit: 20,
        }),
      });
    });

    it("rejects creating an investment linked to another user's account", async () => {
      const mockDb = db as any;

      mockDb.account.findUnique.mockResolvedValue({
        id: 'other-account',
        userId: 'another-user',
      });

      const res = await createInvestment({
        name: 'Test Asset',
        type: 'Stocks',
        symbol: 'TEST',
        accountId: 'other-account',
        quantity: 1,
        costBasis: 100,
        marketValue: 120,
      });

      expect(res?.serverError).toContain('Unauthorized account');
      expect(mockDb.investment.create).not.toHaveBeenCalled();
    });

    it("rejects moving an investment to another user's account", async () => {
      const mockDb = db as any;

      mockDb.investment.findUnique.mockResolvedValue({
        id: 'inv-1',
        userId: 'test-user-id',
        accountId: null,
        costBasis: 100,
        marketValue: 120,
      });

      mockDb.account.findUnique.mockResolvedValue({
        id: 'other-account',
        userId: 'another-user',
      });

      const res = await updateInvestment({
        id: 'inv-1',
        accountId: 'other-account',
      });

      expect(res?.serverError).toContain('Unauthorized account');
      expect(mockDb.investment.update).not.toHaveBeenCalled();
    });
  });
});
