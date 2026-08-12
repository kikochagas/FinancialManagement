import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { updateSettings, resetAndSeedDatabase } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Settings Actions', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('updateSettings', () => {
    it('should upsert settings for global id', async () => {
      mockDb.settings.upsert.mockResolvedValue({ id: 'global', theme: 'Light' });

      await updateSettings({
        theme: 'Light',
        currency: 'USD',
        language: 'English'
      });

      expect(mockDb.settings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
          create: { userId: 'test-user-id', theme: 'Light', currency: 'USD', language: 'English' },
          update: { theme: 'Light', currency: 'USD', language: 'English' }
        })
      );
    });
  });

  describe('resetAndSeedDatabase', () => {
    it('should delete all records and reseed without throwing', async () => {
      const mockDb = db as any;
      const resolvedPromise = Promise.resolve();
      mockDb.settings.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.assetAllocation.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.taxReservation.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.budget.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.monthlySnapshot.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.goal.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.investment.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.transaction.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.category.deleteMany.mockReturnValue(resolvedPromise);
      mockDb.account.deleteMany.mockReturnValue(resolvedPromise);
      
      mockDb.account.create.mockResolvedValue({ id: 'a-1' });
      mockDb.category.create.mockResolvedValue({ id: 'c-1' });

      const res = await resetAndSeedDatabase();

      expect(mockDb.settings.deleteMany).toHaveBeenCalled();
      expect(mockDb.transaction.deleteMany).toHaveBeenCalled();
      expect(res?.data?.success).toBe(true);
    });
  });
});
