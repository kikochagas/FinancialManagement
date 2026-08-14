import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { deleteAccount } from '../actions';

vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

const mockDb = db as any;

describe('Accounts Actions Delete External', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  it('allows normal manual account deletion', async () => {
    mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [] });
    let res = await deleteAccount({ id: 'acc-1' });
    expect(res?.serverError).toBeUndefined();
    expect(mockDb.account.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
  });

  it('allows deletion of linked account', async () => {
    mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [{ id: 'm-1' }] });
    let res = await deleteAccount({ id: 'acc-1' });
    expect(res?.serverError).toBeUndefined();
    expect(mockDb.account.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
  });
});
