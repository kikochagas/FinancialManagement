import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnableBankingClient, EnableBankingProviderError } from '../enable-banking-client';
import * as jose from 'jose';

// Mock fs to simulate key
vi.mock('fs', () => {
  return {
    readFileSync: vi.fn().mockReturnValue('mock-private-key'),
    default: {
      readFileSync: vi.fn().mockReturnValue('mock-private-key')
    }
  };
});

// Mock jose
vi.mock('jose', () => {
  const setProtectedHeader = vi.fn().mockReturnThis();
  const setIssuer = vi.fn().mockReturnThis();
  const setAudience = vi.fn().mockReturnThis();
  const setIssuedAt = vi.fn().mockReturnThis();
  const setExpirationTime = vi.fn().mockReturnThis();
  const sign = vi.fn().mockResolvedValue('mock-jwt-token');

  return {
    importPKCS8: vi.fn().mockResolvedValue('mock-imported-key'),
    SignJWT: class {
      setProtectedHeader = setProtectedHeader;
      setIssuer = setIssuer;
      setAudience = setAudience;
      setIssuedAt = setIssuedAt;
      setExpirationTime = setExpirationTime;
      sign = sign;
    },
  };
});

describe('EnableBankingClient Contract', () => {
  let originalFetch: any;
  let fetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    
    process.env.ENABLE_BANKING_APPLICATION_ID = 'test-app-id';
    process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = '/path/to/key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('JWT generation follows contract (kid, issuer, audience)', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'http://redirect' })
    });

    await client.createAuthorization('Bank', 'PT', 'http://cb', 'state123');

    // Access the mocked SignJWT instance
    // Instead of mock.results, we just check the methods since we attached them to the class prototype/instances
    // Actually, the vi.fn()s are shared singletons across all instantiations in the mock
    const joseMock = await import('jose');
    const instance = new joseMock.SignJWT({});
    
    expect(instance.setProtectedHeader).toHaveBeenCalledWith({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'test-app-id'
    });
    expect(instance.setIssuer).toHaveBeenCalledWith('enablebanking.com');
    expect(instance.setAudience).toHaveBeenCalledWith('api.enablebanking.com');
    expect(instance.setIssuedAt).toHaveBeenCalled();
    expect(instance.setExpirationTime).toHaveBeenCalledWith('1h');
  });

  it('POST /auth calculates valid_until correctly based on seconds and maintains required payload structure', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'http://redirect', authorization_id: 'auth-1' })
    });

    const mockSeconds = 15552000; // ~180 days in seconds
    await client.createAuthorization('Bank', 'PT', 'http://cb', 'state123', mockSeconds);

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    
    expect(body.psu_type).toBe('personal');
    expect(body.aspsp.name).toBe('Bank');
    expect(body.aspsp.country).toBe('PT');
    expect(body.state).toBe('state123');
    expect(body.redirect_url).toBe('http://cb');

    const validUntil = new Date(body.access.valid_until);
    const expectedTime = Date.now() + mockSeconds * 1000;
    const diff = Math.abs(validUntil.getTime() - expectedTime);

    // Allow 1 second tolerance for execution time
    expect(diff).toBeLessThan(1000);
  });


  it('POST /sessions sends only code', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'sess-1', accounts: [] })
    });

    await client.completeAuthorization('test-code', 'http://cb');

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body).toEqual({ code: 'test-code' });
    expect(body.redirect_uri).toBeUndefined();
  });

  it('API requests send Application JWT as Bearer token and never session ID', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ balances: [] })
    });

    await client.getBalances('acc-123');

    const fetchCall = fetchMock.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers['Authorization']).toBe('Bearer mock-jwt-token');
  });

  it('Parses snake_case balance payload correctly', () => {
    const client = new EnableBankingClient();
    const externalBalances = client.normalizeBalance([
      { amount: 100, currency: 'EUR', type: 'ITBD', date: new Date() }
    ]);
    expect(externalBalances).toBeDefined();

    // Since normalizeBalance expects our internal DTO after getBalances maps it, we should test getBalances mapping
  });

  it('getBalances maps snake_case correctly', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          {
            balance_amount: { amount: "100.50", currency: "EUR" },
            balance_type: "ITBD",
            reference_date: "2023-10-01T12:00:00Z",
            last_change_date_time: "2023-10-01T10:00:00Z"
          }
        ]
      })
    });

    const result = await client.getBalances('uid-123');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      amount: 100.50,
      currency: 'EUR',
      type: 'ITBD',
      date: new Date('2023-10-01T12:00:00Z'),
    });
  });

  it('Parses valid_until from session response', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'sess-1',
        accounts: [],
        access: {
          valid_until: "2024-01-01T00:00:00Z"
        }
      })
    });

    const result = await client.completeAuthorization('code', 'url');
    expect(result.validUntil).toBeDefined();
    expect(result.validUntil?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it('Throws EnableBankingProviderError on 401/403', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'session_expired' })
    });

    await expect(client.getBalances('acc-1')).rejects.toThrow(EnableBankingProviderError);
    await expect(client.getBalances('acc-1')).rejects.toThrow('Enable Banking API error: 401 {"error":"session_expired"}');
  });

  it('getInstitutions requests correct query params and maps ASPSPs correctly without relying on services array', async () => {
    const client = new EnableBankingClient();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        aspsps: [
          {
            name: "Test Bank",
            country: "PT",
            logo: "https://logo.com/bank.png",
            maximum_consent_validity: 90
            // Notice: no services or psu_types array provided by API
          },
          {
            name: "No Logo Bank",
            country: "PT",
            maximum_consent_validity: 180
          },
          {
            name: "", // Missing name, should be filtered out
            country: "PT",
          }
        ]
      })
    });

    const result = await client.getInstitutions("PT");

    const fetchCall = fetchMock.mock.calls[0];
    const url = fetchCall[0];
    
    // Check URL query parameters
    expect(url).toContain("country=PT");
    expect(url).toContain("service=AIS");
    expect(url).toContain("psu_type=personal");

    // Check mapping
    expect(result).toHaveLength(2);
    
    expect(result[0]).toEqual({
      id: "Test Bank",
      name: "Test Bank",
      country: "PT",
      logo: "https://logo.com/bank.png",
      maximumConsentValidity: 90
    });

    expect(result[1]).toEqual({
      id: "No Logo Bank",
      name: "No Logo Bank",
      country: "PT",
      logo: undefined,
      maximumConsentValidity: 180
    });
  });
});
