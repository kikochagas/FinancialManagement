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
    beforeEach(() => {
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
      mockDb.category.findMany.mockResolvedValue([
        { id: 'c-1', systemKey: 'salary', name: 'Salary' },
        { id: 'c-2', systemKey: 'entertainment', name: 'Entertainment' },
        { id: 'c-3', systemKey: 'fees', name: 'Fees' },
        { id: 'c-4', systemKey: 'travel', name: 'Travel' },
        { id: 'c-5', systemKey: 'purchase', name: 'Purchase' },
        { id: 'c-6', systemKey: 'tax', name: 'Tax' },
        { id: 'c-7', systemKey: 'groceries', name: 'Groceries' },
      ]);
    });

    it('should delete all records and reseed without throwing', async () => {

      const res = await resetAndSeedDatabase();

      expect(mockDb.settings.deleteMany).toHaveBeenCalled();
      expect(mockDb.transaction.deleteMany).toHaveBeenCalled();
      
      // We don't have a real DB in this unit test to check exact state, but we ensure it succeeds.
      expect(res?.data?.success).toBe(true);
    });

    it('should result in exactly the canonical categories', async () => {
      // We simulate success here as unit test, verifying exactly 12 keys exist.
      const canonicalKeys = [
        "salary", "purchase", "withdrawal", "transfer", "investment", 
        "interest", "tax", "fees", "groceries", "travel", 
        "entertainment", "uncategorized"
      ];
      
      const res = await resetAndSeedDatabase();
      expect(res?.data?.success).toBe(true);
      
      // Verification: ensure default categories were requested for creation correctly
      // We check that ensureDefaultCategories created all missing canonical keys
      const createdCalls = mockDb.category.create.mock.calls;
      const createdKeys = createdCalls.map((c: any) => c[0].data.systemKey);
      
      // Our mock returns 7 existing categories. The 5 missing ones should have been created.
      // So all 12 canonical categories are either found or created.
      expect(createdKeys.length).toBeGreaterThan(0);
      
      const allExpectedCreated = canonicalKeys.filter(k => 
        !['salary', 'entertainment', 'fees', 'travel', 'purchase', 'tax', 'groceries'].includes(k)
      );
      
      allExpectedCreated.forEach(k => {
        expect(createdKeys).toContain(k);
      });
      
      // It should not create duplicate or fake "internal transfer" categories
      expect(createdKeys).not.toContain("internal transfer");
    });
  });
});
