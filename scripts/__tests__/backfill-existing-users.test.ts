import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backfillTransactions } from '../backfill-existing-users';

describe('backfill-existing-users migration', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
      },
      category: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      transaction: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      }
    };
  });

  it('E. Dry-run correctly reports a modern Debit with categoryId=null as a pending repair', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-1',
        direction: 'Debit',
        categoryId: null,
      }
    ]);

    // intercept console.log
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await backfillTransactions(true, mockPrisma);

    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    
    // Check if the script counted it as an update
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Updated: 1'));
    
    logSpy.mockRestore();
  });

  it('F. Dry-run correctly reports InternalTransfer + categoryId=null as needing Transfer category', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-2',
        userId: 'user-1',
        direction: 'InternalTransfer',
        categoryId: null,
      }
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await backfillTransactions(true, mockPrisma);

    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Updated: 1'));
    
    logSpy.mockRestore();
  });
});
