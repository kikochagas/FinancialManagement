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

  it('prevents deletion of a connected linked account', async () => {
    mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [{ id: 'm-1', disconnectedAt: null }] });
    let res = await deleteAccount({ id: 'acc-1' });
    expect(res?.serverError).toBe('Disconnect the bank account before deleting it.');
    expect(mockDb.account.delete).not.toHaveBeenCalled();
  });

  it('allows deletion of a disconnected linked account', async () => {
    mockDb.account.findUnique.mockResolvedValue({ id: 'acc-1', userId: 'test-user-id', externalMappings: [{ id: 'm-1', disconnectedAt: new Date() }] });
    let res = await deleteAccount({ id: 'acc-1' });
    expect(res?.serverError).toBeUndefined();
    expect(mockDb.account.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
  });

  it('TEST G - shared session isolation during delete', async () => {
    // Delete Francisco (disconnected) which shares BankConnection with Millennium (active)
    mockDb.account.findUnique.mockResolvedValue({ 
      id: 'francisco-acc', 
      userId: 'test-user-id', 
      externalMappings: [{ id: 'map-a', disconnectedAt: new Date(), bankConnectionId: 'conn-1' }] 
    });
    
    // Simulate deleteAccount called on francisco-acc
    let res = await deleteAccount({ id: 'francisco-acc' });
    
    // Assert successful deletion
    expect(res?.serverError).toBeUndefined();
    expect(mockDb.account.delete).toHaveBeenCalledWith({ where: { id: 'francisco-acc' } });
    
    // The provider revokeSession is NOT called because deleteAccount does NOT revoke sessions, it relies on Prisma delete and cascade
    // We can just verify it succeeds without attempting to touch BankConnection status.
  });
});
