import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as ConnectPOST } from "../connect/route";
import { GET as CallbackGET } from "../callback/route";
import * as auth from "@/lib/auth";
import { db as prisma } from "@/lib/db";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

export const mockGetInstitutions = vi.fn();
export const mockCreateAuthorization = vi.fn();
export const mockCompleteAuthorization = vi.fn();

vi.mock("@/lib/banking/enable-banking-client", () => {
  return {
    EnableBankingClient: class {
      getInstitutions = mockGetInstitutions;
      createAuthorization = mockCreateAuthorization;
      completeAuthorization = mockCompleteAuthorization;
    },
    externalAccountMapping: {
      findUnique: vi.fn(),
      update: vi.fn(),
    }
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    bankAuthorizationState: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    bankConnection: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pendingExternalAccount: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    externalAccountMapping: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Banking Auth APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/banking/connect", () => {
    it("fails if unauthenticated", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue(null);
      const req = new Request("http://localhost/api/banking/connect", {
        method: "POST",
        body: JSON.stringify({ institutionName: "Test Bank", institutionCountry: "PT" }),
      });
      const res = await ConnectPOST(req);
      expect(res.status).toBe(401);
    });

    it("fails with invalid institution", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      mockGetInstitutions.mockResolvedValue([
        { id: "Other Bank", name: "Other Bank", country: "PT" }
      ]);
      const req = new Request("http://localhost/api/banking/connect", {
        method: "POST",
        body: JSON.stringify({ institutionName: "Test Bank", institutionCountry: "PT" }),
      });
      const res = await ConnectPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid institution");
    });

    it("creates state and returns authorization url", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      mockGetInstitutions.mockResolvedValue([
        { id: "Test Bank", name: "Test Bank", country: "PT", maximumConsentValidity: 90 }
      ]);
      mockCreateAuthorization.mockResolvedValue({
        url: "http://enablebanking.test/auth",
        providerAuthorizationId: "auth-456"
      });

      const req = new Request("http://localhost/api/banking/connect", {
        method: "POST",
        body: JSON.stringify({ institutionName: "Test Bank", institutionCountry: "PT" }),
      });
      const res = await ConnectPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authorizationUrl).toBe("http://enablebanking.test/auth");
      
      expect(prisma.bankAuthorizationState.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-123",
            institutionName: "Test Bank",
          })
        })
      );
    });
  });

  describe("GET /api/banking/callback", () => {
    it("redirects on missing state", async () => {
      const req = new Request("http://localhost/api/banking/callback?code=abc");
      const res = await CallbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=missing_state");
    });

    it("redirects on unknown or expired state", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.$transaction).mockResolvedValue(null); // state not found or invalid
      const req = new Request("http://localhost/api/banking/callback?code=abc&state=badstate");
      const res = await CallbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=invalid_state");
    });

    it("handles provider error / cancellation", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.$transaction).mockResolvedValue({
        id: "state-1",
        userId: "user-123",
        institutionName: "Test Bank",
        institutionCountry: "PT"
      } as any);

      const req = new Request("http://localhost/api/banking/callback?error=user_cancelled&state=goodstate");
      const res = await CallbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=authorization_failed");
    });

    it("redirects on missing code with valid unused state", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.$transaction).mockResolvedValue({
        id: "state-1",
        userId: "user-123",
        institutionName: "Test Bank",
        institutionCountry: "PT"
      } as any);

      // Only state, no code
      const req = new Request("http://localhost/api/banking/callback?state=goodstate");
      const res = await CallbackGET(req);
      
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=authorization_failed");
      expect(mockCompleteAuthorization).not.toHaveBeenCalled();
      expect(prisma.bankConnection.create).not.toHaveBeenCalled();
    });

    it("handles session creation failure", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.$transaction).mockResolvedValue({
        id: "state-1",
        userId: "user-123",
        institutionName: "Test Bank",
        institutionCountry: "PT"
      } as any);
      
      mockCompleteAuthorization.mockRejectedValue(new Error("API Down"));

      const req = new Request("http://localhost/api/banking/callback?code=abc&state=goodstate");
      const res = await CallbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=session_creation_failed");
    });

    it("creates bank connection on successful callback", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.$transaction).mockResolvedValue({
        id: "state-1",
        userId: "user-123",
        institutionName: "Test Bank",
        institutionCountry: "PT"
      } as any);
      vi.mocked(prisma.bankConnection.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.bankConnection.create).mockResolvedValue({
        id: "conn-123",
        userId: "user-123",
      } as any);

      mockCompleteAuthorization.mockResolvedValue({
        providerSessionId: "session-456",
        accountsData: [{ uid: "acc1", identification_hash: "hash1" }]
      });

      const req = new Request("http://localhost/api/banking/callback?code=abc&state=goodstate");
      const res = await CallbackGET(req);
      
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/accounts/link?connectionId=conn-123");
      
      expect(prisma.pendingExternalAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bankConnectionId_identificationHash: expect.objectContaining({
              bankConnectionId: "conn-123"
            })
          })
        })
      );
    });
    it("prevents state replay attacks", async () => {
      vi.mocked(auth.getUserId).mockResolvedValue("user-123");
      
      // First call simulates successful finding and updating
      vi.mocked(prisma.$transaction).mockResolvedValueOnce({
        id: "state-1",
        userId: "user-123",
        institutionName: "Test Bank",
        institutionCountry: "PT"
      } as any);

      // Second call simulates returning null because usedAt is not null
      vi.mocked(prisma.$transaction).mockResolvedValueOnce(null);

      mockCompleteAuthorization.mockResolvedValue({
        providerSessionId: "session-456",
        accountsData: [{ uid: "acc1", identification_hash: "hash1" }]
      });

      vi.mocked(prisma.bankConnection.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.bankConnection.create).mockResolvedValue({
        id: "conn-123",
        userId: "user-123",
      } as any);

      const req1 = new Request("http://localhost/api/banking/callback?code=abc&state=goodstate");
      const res1 = await CallbackGET(req1);
      expect(res1.status).toBe(307);
      expect(res1.headers.get("location")).toContain("/accounts/link?connectionId=conn-123");

      const req2 = new Request("http://localhost/api/banking/callback?code=abc&state=goodstate");
      const res2 = await CallbackGET(req2);
      expect(res2.status).toBe(307);
      expect(res2.headers.get("location")).toContain("error=invalid_state");
    });
  });
});
