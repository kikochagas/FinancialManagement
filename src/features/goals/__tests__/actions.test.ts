import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { createGoal, updateGoal, deleteGoal } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Goals Actions', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('createGoal', () => {
    it('should create goal and calculate initial progress', async () => {
      mockDb.goal.create.mockResolvedValue({ id: 'g-1' });

      await createGoal({
        name: 'House',
        type: 'House',
        targetAmount: 1000,
        currentAmount: 500,
        estimatedCompletion: '2027'
      });

      expect(mockDb.goal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'test-user-id',
          progress: 50 // 500/1000 * 100
        })
      });
    });
  });

  describe('updateGoal', () => {
    it('should update currentAmount and recalculate progress', async () => {
      mockDb.goal.findUnique.mockResolvedValue({ targetAmount: 1000, currentAmount: 500, userId: 'test-user-id' });
      mockDb.goal.update.mockResolvedValue({ id: 'g-1' });

      await updateGoal({
        id: 'g-1',
        currentAmount: 750
      });

      expect(mockDb.goal.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { currentAmount: 750, progress: 75 }
      });
    });
  });

  describe('deleteGoal', () => {
    it('should delete goal', async () => {
      mockDb.goal.findUnique.mockResolvedValue({ id: 'g-1', userId: 'test-user-id' });
      await deleteGoal({ id: 'g-1' });
      expect(mockDb.goal.delete).toHaveBeenCalledWith({ where: { id: 'g-1' } });
    });
  });
});
