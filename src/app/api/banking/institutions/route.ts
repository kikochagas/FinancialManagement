import { NextResponse } from "next/server";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

export async function GET(request: Request) {
  try {
    const client = new EnableBankingClient();
    // 11. GET Portuguese institutions using: country=PT, service=AIS, psu_type=personal
    // Our EnableBankingClient's getInstitutions method defaults to these filters
    const institutions = await client.getInstitutions("PT");
    
    return NextResponse.json({ institutions });
  } catch (error: any) {
    console.error("Failed to fetch banking institutions:", error);
    return NextResponse.json({ error: "Failed to fetch institutions" }, { status: 500 });
  }
}
