import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReportsData } from '../queries';
import { db } from '@/lib/db';
import * as auth from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(),
}));

describe('getReportsData', () => {
  beforeEach(async () => {
    // Clear test db categories for isolation
    await db.category.deleteMany();
    await db.taxReservation.deleteMany();
    await db.goal.deleteMany();
    await db.investment.deleteMany();
    await db.transaction.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
  });

  it('creates default categories if user has zero categories, and does not duplicate on second call', async () => {
    const userId = 'user-zero-cats';
    await db.user.create({ data: { id: userId, email: 'zero@test.com', passwordHash: 'h' } });
    
    vi.mocked(auth.getUserId).mockResolvedValue(userId);

    // Initial state: 0 categories
    let cats = await db.category.findMany({ where: { userId } });
    expect(cats.length).toBe(0);

    // Call 1
    const data1 = await getReportsData();
    expect(data1.categories.length).toBeGreaterThan(0);
    
    // Check specific keys exist
    const keys1 = data1.categories.map(c => c.systemKey);
    expect(keys1).toContain('uncategorized');
    expect(keys1).toContain('salary');
    expect(keys1).toContain('transfer');
    
    const count1 = data1.categories.length;

    // Call 2
    const data2 = await getReportsData();
    expect(data2.categories.length).toBe(count1); // no duplicates
  });

  it('preserves custom categories', async () => {
    const userId = 'user-custom-cats';
    await db.user.create({ data: { id: userId, email: 'custom@test.com', passwordHash: 'h' } });
    
    vi.mocked(auth.getUserId).mockResolvedValue(userId);

    // Create a custom category first
    await db.category.create({
      data: {
        id: 'cat-custom-1',
        userId,
        name: 'Restaurants',
        directionHint: 'Debit',
        color: '#ff0000'
      }
    });

    const data = await getReportsData();
    
    const names = data.categories.map(c => c.name);
    expect(names).toContain('Restaurants');
    expect(names).toContain('Salary'); // canonical default
  });
});
