import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { ensureDefaultCategories, DEFAULT_CATEGORIES } from '../default-categories';

vi.mock('@/lib/db', () => ({
  db: {
    category: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    }
  }
}));

const mockDb = db as any;

describe('Default Categories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('safely handles same-name category with conflicting systemKey', async () => {
    // Simulate user already having "Salary" mapped to "income", which is a conflict for systemKey="salary"
    mockDb.category.findMany.mockResolvedValueOnce([
      { id: 'existing-1', name: 'Salary', systemKey: 'income' },
      { id: 'existing-2', name: 'Purchase', systemKey: 'purchase' }
    ]);
    
    // For the return at the end of the function
    mockDb.category.findMany.mockResolvedValueOnce([
      { id: 'existing-1', name: 'Salary', systemKey: 'income' },
      { id: 'existing-2', name: 'Purchase', systemKey: 'purchase' }
    ]);

    await ensureDefaultCategories('user-1');

    // We expect it to SKIP creating "Salary" because a same-named one exists but conflicts.
    // We expect it to NOT update it either.
    // It should create the other missing canonicals.

    // Salary shouldn't be created or updated
    expect(mockDb.category.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-1' } })
    );
    
    // It should not create a new Salary duplicate
    const createCalls = mockDb.category.create.mock.calls;
    const createdNames = createCalls.map((c: any) => c[0].data.name);
    expect(createdNames).not.toContain('Salary');
    
    // It should create the others
    expect(createdNames).toContain('Withdrawal');
    expect(createdNames).toContain('Transfer');
  });

  it('adopts same-name category if systemKey is null', async () => {
    mockDb.category.findMany.mockResolvedValueOnce([
      { id: 'existing-1', name: 'Salary', systemKey: null },
    ]);
    mockDb.category.findMany.mockResolvedValueOnce([]); // mock return
    
    await ensureDefaultCategories('user-1');

    expect(mockDb.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-1' },
        data: { systemKey: 'salary', directionHint: 'Credit' }
      })
    );
    
    const createCalls = mockDb.category.create.mock.calls;
    const createdNames = createCalls.map((c: any) => c[0].data.name);
    expect(createdNames).not.toContain('Salary'); // adopted, not created
  });
});
