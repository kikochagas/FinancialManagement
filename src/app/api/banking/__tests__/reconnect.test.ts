import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { GET as CallbackGET } from '../callback/route';
import { POST as ConnectPOST } from '../connect/route';
import { mockDeep, mockReset } from 'vitest-mock-extended';

vi.mock('@/lib/db', async () => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

vi.mock('@/lib/banking/enable-banking-client', () => {
  return {
    EnableBankingClient: class {
      getInstitutions = vi.fn().mockResolvedValue([
        { name: 'Test Bank', country: 'PT', maximumConsentValidity: 90 }
      ]);
      createAuthorization = vi.fn().mockResolvedValue({
        url: 'http://test.url'
      });
      completeAuthorization = vi.fn().mockResolvedValue({
        providerSessionId: 'sess-1',
        accountsData: [
          { uid: 'new-uid-a', identification_hash: 'hash-a' },
          { uid: 'new-uid-b', identification_hash: 'hash-b' }
        ]
      });
    }
  };
});

const mockDb = db as any;

describe('Banking Reconnect Tests', () => {
  beforeEach(() => {
    mockReset(mockDb);
  });

  describe('TEST D - Security', () => {
    it('rejects reconnectAccountId belonging to another user', async () => {
      mockDb.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'other-user', // Different user
        externalMappings: []
      });

      const req = new Request('http://localhost/api/banking/connect', {
        method: 'POST',
        body: JSON.stringify({
          institutionName: 'Test Bank',
          institutionCountry: 'PT',
          reconnectAccountId: 'acc-1'
        })
      });

      const res = await ConnectPOST(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Callback Reconciliation', () => {
    it('TEST A & B & C - Reauth active account with disconnected sibling', async () => {
      // Simulate authState returned by transaction
      mockDb.$transaction.mockResolvedValue({
        id: 'state-1',
        userId: 'test-user-id',
        institutionName: 'Test Bank',
        institutionCountry: 'PT',
        reconnectAccountId: 'acc-2' // Millenium
      });

      // Existing connection
      mockDb.bankConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        userId: 'test-user-id',
      });
      mockDb.bankConnection.update.mockResolvedValue({
        id: 'conn-1',
        userId: 'test-user-id',
      });

      // Existing mappings matching hashes
      mockDb.externalAccountMapping.findUnique.mockImplementation(({ where }: any) => {
        console.log("findUnique called with where:", JSON.stringify(where));
        if (where.bankConnectionId_identificationHash?.identificationHash === 'hash-a') {
          return {
            id: 'map-a',
            accountId: 'acc-1', // Francisco
            identificationHash: 'hash-a',
            disconnectedAt: new Date(), // Disconnected
          };
        }
        if (where.bankConnectionId_identificationHash?.identificationHash === 'hash-b') {
          return {
            id: 'map-b',
            accountId: 'acc-2', // Millenium
            identificationHash: 'hash-b',
            disconnectedAt: null, // Active (Or being explicitly reconnected if it was disconnected)
          };
        }
        return null;
      });

      const req = new Request('http://localhost/api/banking/callback?code=abc&state=good');
      const res = await CallbackGET(req);
      
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/accounts/link?connectionId=conn-1");

      // Verify mapping updates
      expect(mockDb.externalAccountMapping.update).toHaveBeenCalledWith({
        where: { id: 'map-a' },
        data: expect.objectContaining({ providerAccountUid: 'new-uid-a' }) // disconnectedAt is NOT nullified because reconnectAccountId != acc-1
      });
      // Ensure disconnectedAt: null is NOT in the data for map-a
      const callA = mockDb.externalAccountMapping.update.mock.calls.find((call: any) => call[0].where.id === 'map-a');
      expect(callA[0].data.disconnectedAt).toBeUndefined();

      expect(mockDb.externalAccountMapping.update).toHaveBeenCalledWith({
        where: { id: 'map-b' },
        data: { providerAccountUid: 'new-uid-b' } // It was already active, so shouldReactivate was false (disconnectedAt !== null was false) OR if it was disconnected, shouldReactivate would be true
      });
    });

    it('TEST C - Ordinary connect flow (no reconnectAccountId)', async () => {
      mockDb.$transaction.mockResolvedValue({
        id: 'state-1',
        userId: 'test-user-id',
        institutionName: 'Test Bank',
        institutionCountry: 'PT',
        reconnectAccountId: null
      });

      mockDb.bankConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
      mockDb.bankConnection.update.mockResolvedValue({ id: 'conn-1' });

      mockDb.externalAccountMapping.findUnique.mockImplementation(({ where }: any) => {
        if (where.bankConnectionId_identificationHash?.identificationHash === 'hash-a') {
          return {
            id: 'map-a',
            accountId: 'acc-1',
            identificationHash: 'hash-a',
            disconnectedAt: new Date(),
          };
        }
        return null;
      });

      const req = new Request('http://localhost/api/banking/callback?code=abc&state=good');
      await CallbackGET(req);

      // Should not reactivate
      const call = mockDb.externalAccountMapping.update.mock.calls.find((c: any) => c[0].where.id === 'map-a');
      expect(call[0].data.disconnectedAt).toBeUndefined();
    });

    it('TEST B - Explicitly reconnect disconnected account', async () => {
      mockDb.$transaction.mockResolvedValue({
        id: 'state-1',
        userId: 'test-user-id',
        institutionName: 'Test Bank',
        institutionCountry: 'PT',
        reconnectAccountId: 'acc-1'
      });

      mockDb.bankConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
      mockDb.bankConnection.update.mockResolvedValue({ id: 'conn-1' });

      mockDb.externalAccountMapping.findUnique.mockImplementation(({ where }: any) => {
        if (where.bankConnectionId_identificationHash?.identificationHash === 'hash-a') {
          return {
            id: 'map-a',
            accountId: 'acc-1',
            identificationHash: 'hash-a',
            disconnectedAt: new Date(), // Currently disconnected
          };
        }
        return null;
      });

      const req = new Request('http://localhost/api/banking/callback?code=abc&state=good');
      await CallbackGET(req);

      // Should reactivate
      const call = mockDb.externalAccountMapping.update.mock.calls.find((c: any) => c[0].where.id === 'map-a');
      expect(call[0].data.disconnectedAt).toBeNull(); // Reactivated!
    });
  });
});
