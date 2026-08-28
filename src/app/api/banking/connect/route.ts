import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";
import { db as prisma } from "@/lib/db";
import crypto from "crypto";
import { getAppBaseUrl } from "@/lib/url";

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { institutionName, institutionCountry, reconnectAccountId } = body;

    if (!institutionName || !institutionCountry) {
      return NextResponse.json({ error: "Institution details are required" }, { status: 400 });
    }

    if (reconnectAccountId) {
      const existingAccount = await prisma.account.findUnique({
        where: { id: reconnectAccountId },
        include: { externalMappings: { include: { bankConnection: true } } }
      });

      if (!existingAccount || existingAccount.userId !== userId) {
        return NextResponse.json({ error: "Invalid reconnect account" }, { status: 403 });
      }

      const hasMatchingMapping = existingAccount.externalMappings.some(
        m => m.bankConnection.institutionName === institutionName && m.bankConnection.institutionCountry === institutionCountry
      );

      if (!hasMatchingMapping) {
        return NextResponse.json({ error: "Account has no historical mapping for this institution" }, { status: 400 });
      }
    }

    const client = new EnableBankingClient();
    const institutions = await client.getInstitutions(institutionCountry);
    
    const institution = institutions.find(
      (inst) => inst.name === institutionName && inst.country === institutionCountry
    );

    if (!institution) {
      return NextResponse.json({ error: "Invalid institution" }, { status: 400 });
    }

    const stateStr = crypto.randomBytes(32).toString("hex");
    const baseUrl = getAppBaseUrl();
    const callbackUrl = `${baseUrl}/api/banking/callback`;
    
    // We add 5 minutes to expiration for the state itself
    const stateExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const maxValidity = institution.maximumConsentValidity;
    if (
      maxValidity === undefined || 
      maxValidity === null || 
      !Number.isFinite(maxValidity) || 
      maxValidity <= 0
    ) {
      return NextResponse.json({ error: "Institution maximum consent validity is required and must be a positive finite number" }, { status: 400 });
    }

    const authData = await client.createAuthorization(
      institution.name,
      institution.country,
      callbackUrl,
      stateStr,
      maxValidity
    );

    await prisma.bankAuthorizationState.create({
      data: {
        userId,
        stateStr,
        institutionName: institution.name,
        institutionCountry: institution.country,
        expiresAt: stateExpiresAt,
        reconnectAccountId: reconnectAccountId || null,
      }
    });

    // Best-effort cleanup of expired pending accounts (non-blocking)
    try {
      await prisma.pendingExternalAccount.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
    } catch (e) {
      console.error("Cleanup of pending accounts failed, ignoring:", e);
    }

    return NextResponse.json({ 
      authorizationUrl: authData.url 
    });

  } catch (error: any) {
    if (error.name === "EnableBankingProviderError") {
      console.error("Enable Banking authorization failed", {
        status: error.status,
        code: error.body?.error,
        message: error.body?.message,
      });
    } else {
      console.error("Connect error occurred:", error);
    }
    return NextResponse.json({ error: "Failed to initialize connection" }, { status: 500 });
  }
}
