import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db as prisma } from "@/lib/db";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (!state) {
      return NextResponse.redirect(new URL("/accounts?error=missing_state", request.url));
    }

    const userId = await getUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Atomically find and mark state as used
    // Prisma doesn't have a direct "find and update if condition matches" that returns the OLD state easily without a transaction if we want to ensure it wasn't used.
    // We can do it in a transaction:
    const authState = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.bankAuthorizationState.findUnique({
        where: { stateStr: state }
      });

      if (!existing || existing.userId !== userId || existing.usedAt !== null || existing.expiresAt < new Date()) {
        return null;
      }

      return await tx.bankAuthorizationState.update({
        where: { id: existing.id },
        data: { usedAt: new Date() }
      });
    });

    if (!authState) {
      return NextResponse.redirect(new URL("/accounts?error=invalid_state", request.url));
    }

    if (errorParam || !code) {
      // User cancelled or provider error
      return NextResponse.redirect(new URL("/accounts?error=authorization_failed", request.url));
    }

    const client = new EnableBankingClient();
    const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/api/banking/callback`;
    
    let connectionResult;
    try {
      connectionResult = await client.completeAuthorization(code, redirectUri);
    } catch (err: any) {
      console.error("Session creation failed.");
      return NextResponse.redirect(new URL("/accounts?error=session_creation_failed", request.url));
    }

    // Re-authorization vs new connection:
    // When reconnecting an existing REVOKED/EXPIRED connection, update its providerSessionId, validUntil and status.
    let bankConnection = await prisma.bankConnection.findFirst({
      where: {
        userId,
        institutionName: authState.institutionName,
        institutionCountry: authState.institutionCountry,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (bankConnection) {
      bankConnection = await prisma.bankConnection.update({
        where: { id: bankConnection.id },
        data: {
          providerSessionId: connectionResult.providerSessionId,
          validUntil: connectionResult.validUntil,
          status: "CONNECTED",
          updatedAt: new Date(),
        }
      });
    } else {
      bankConnection = await prisma.bankConnection.create({
        data: {
          userId,
          provider: "ENABLE_BANKING",
          providerSessionId: connectionResult.providerSessionId,
          institutionName: authState.institutionName,
          institutionCountry: authState.institutionCountry,
          status: "CONNECTED",
          validUntil: connectionResult.validUntil,
        }
      });
    }

    // Store the accounts data temporarily in the database via pending accounts to link later.
    
    const bankConnectionId = bankConnection.id;

    if (connectionResult.accountsData && connectionResult.accountsData.length > 0) {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration
      const pendingAccountsData = connectionResult.accountsData.flatMap((acc: any) => {
        const providerAccountUid = acc.uid;
        const identificationHash = acc.identification_hash;
        
        if (!providerAccountUid || !identificationHash) {
          return [];
        }

        return [{
          bankConnectionId,
          providerAccountUid,
          identificationHash,
          displayName: acc.name || "Unknown Account",
          currency: acc.currency || "EUR",
          cashAccountType: acc.cash_account_type || null,
          maskedIdentifier: acc.account_id?.iban ? `****${acc.account_id.iban.slice(-4)}` : null,
          expiresAt
        }];
      });

      // Reconcile and only insert pending accounts if they don't exist
      for (const pendingData of pendingAccountsData) {
        const existingMapping = await prisma.externalAccountMapping.findUnique({
          where: {
            bankConnectionId_identificationHash: {
              bankConnectionId: pendingData.bankConnectionId,
              identificationHash: pendingData.identificationHash,
            }
          }
        });

        if (existingMapping) {
          // It's already linked. Reconcile automatically.
          const shouldReactivate = existingMapping.disconnectedAt !== null && authState.reconnectAccountId === existingMapping.accountId;

          await prisma.externalAccountMapping.update({
            where: { id: existingMapping.id },
            data: { 
              providerAccountUid: pendingData.providerAccountUid,
              ...(shouldReactivate ? { disconnectedAt: null } : {})
            }
          });
          // Do NOT create a pending account.
        } else {
          // Not linked yet, insert as pending
          await prisma.pendingExternalAccount.upsert({
            where: {
              bankConnectionId_identificationHash: {
                bankConnectionId: pendingData.bankConnectionId,
                identificationHash: pendingData.identificationHash,
              }
            },
            update: pendingData,
            create: pendingData
          });
        }
      }
    }

    const response = NextResponse.redirect(new URL(`/accounts/link?connectionId=${bankConnectionId}`, request.url));
    
    return response;

  } catch (error: any) {
    console.error("Callback error occurred.");
    return NextResponse.redirect(new URL("/accounts?error=internal_error", request.url));
  }
}
