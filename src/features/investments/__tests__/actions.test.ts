import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { updateInvestment } from '../actions';

vi.mock('@/lib/db', async () => {
  const mod = await vi.importActual<any>('vitest-mock-extended');
  return { db: mod.mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('Investments Actions', () => {
  beforeEach(() => {
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
});
