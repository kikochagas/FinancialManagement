import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";
import { db as prisma } from "@/lib/db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { institutionName, institutionCountry } = body;

    if (!institutionName || !institutionCountry) {
      return NextResponse.json({ error: "Institution details are required" }, { status: 400 });
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
    const callbackUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/banking/callback`;
    
    // We add 5 minutes to expiration for the state itself
    const stateExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const maxValidity = institution.maximumConsentValidity;
    if (maxValidity === undefined || maxValidity === null) {
      return NextResponse.json({ error: "Institution maximum consent validity is required but not provided by the provider" }, { status: 400 });
    }

    const authData = await client.createAuthorization(
      institution.name,
      institution.country,
      callbackUrl,
      stateStr,
      institution.maximumConsentValidity
    );

    await prisma.bankAuthorizationState.create({
      data: {
        userId,
        stateStr,
        institutionName: institution.name,
        institutionCountry: institution.country,
        expiresAt: stateExpiresAt,
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
