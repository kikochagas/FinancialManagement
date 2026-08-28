import {
  BankingProvider,
  BankInstitution,
  BankAuthorization,
  BankConnectionResult,
  ExternalBankAccount,
  ExternalBalance,
  ExternalBankTransaction,
  TransactionQuery,
  TransactionResult,
} from "./provider";
import * as jose from "jose";
import { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";

export class EnableBankingProviderError extends Error {
  constructor(public status: number, public body: any) {
    super(`Enable Banking API error: ${status} ${JSON.stringify(body)}`);
    this.name = "EnableBankingProviderError";
  }
}

export class EnableBankingClient implements BankingProvider {
  private apiUrl: string;
  private appId: string;
  private privateKeyPath: string;

  constructor() {
    this.apiUrl = "https://api.enablebanking.com";
    this.appId = process.env.ENABLE_BANKING_APPLICATION_ID || "";
    this.privateKeyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH || "";
    
    if (!this.appId) {
      console.warn("ENABLE_BANKING_APPLICATION_ID is not set");
    }
    if (!process.env.ENABLE_BANKING_PRIVATE_KEY && !this.privateKeyPath) {
      console.warn("ENABLE_BANKING_PRIVATE_KEY and ENABLE_BANKING_PRIVATE_KEY_PATH are both not set");
    }
  }

  private async getPrivateKey() {
    try {
      let keyStr = "";
      if (process.env.ENABLE_BANKING_PRIVATE_KEY) {
        keyStr = process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n');
      } else if (this.privateKeyPath) {
        keyStr = readFileSync(path.resolve(this.privateKeyPath), "utf8");
      } else {
        throw new Error("No private key provided via ENV or PATH");
      }
      return await jose.importPKCS8(keyStr, "RS256");
    } catch (error) {
      console.error("Failed to load Enable Banking private key:", error);
      throw new Error("Enable Banking private key is missing or invalid");
    }
  }

  private async generateToken() {
    const privateKey = await this.getPrivateKey();
    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: this.appId })
      .setIssuer("enablebanking.com")
      .setAudience("api.enablebanking.com")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    return jwt;
  }

  private async request(endpoint: string, method: string = "GET", body?: any) {
    const token = await this.generateToken();
    const url = `${this.apiUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errBody;
      try {
        errBody = await response.json();
      } catch (e) {
        errBody = await response.text();
      }
      throw new EnableBankingProviderError(response.status, errBody);
    }

    return response.json();
  }

  async getInstitutions(country: string): Promise<BankInstitution[]> {
    const params = new URLSearchParams({
      country: country,
      service: "AIS",
      psu_type: "personal",
    });
    
    // Enable Banking /aspsps endpoint
    const data = await this.request(`/aspsps?${params.toString()}`);
    
    if (!data || !data.aspsps) {
      return [];
    }

    const institutions: BankInstitution[] = data.aspsps
      .filter((aspsp: any) => 
        Boolean(aspsp.name) && 
        Boolean(aspsp.country)
      )
      .map((aspsp: any) => ({
        id: aspsp.name, // Enable Banking uses name as primary identifier for auth
        name: aspsp.name,
        country: aspsp.country,
        logo: aspsp.logo,
        maximumConsentValidity: aspsp.maximum_consent_validity,
      }));

    return institutions;
  }

  async createAuthorization(
    institutionName: string,
    institutionCountry: string,
    callbackUrl: string,
    state: string,
    maximumConsentValiditySeconds: number
  ): Promise<BankAuthorization> {
    if (
      !Number.isFinite(maximumConsentValiditySeconds) ||
      maximumConsentValiditySeconds <= 0
    ) {
      throw new Error(
        "maximumConsentValiditySeconds must be a valid positive finite number."
      );
    }
    const validUntilDate = new Date(Date.now() + maximumConsentValiditySeconds * 1000);
    
    const body = {
      access: {
        valid_until: validUntilDate.toISOString(),
      },
      aspsp: {
        name: institutionName,
        country: institutionCountry,
      },
      psu_type: "personal",
      state: state,
      redirect_url: callbackUrl,
    };

    const data = await this.request("/auth", "POST", body);
    
    return {
      url: data.url,
      providerAuthorizationId: data.authorization_id,
    };
  }

  async completeAuthorization(
    code: string,
    redirectUri: string
  ): Promise<BankConnectionResult> {
    const body = { code };

    const data = await this.request("/sessions", "POST", body);
    
    return {
      providerSessionId: data.session_id,
      accountsData: data.accounts,
      validUntil: data.access?.valid_until ? new Date(data.access.valid_until) : undefined,
    };
  }

  async revokeSession(providerSessionId: string): Promise<void> {
    try {
      await this.request(`/sessions/${providerSessionId}`, "DELETE");
    } catch (e) {
      // It might already be revoked or expired, ignore
    }
  }



  async getBalances(
    providerAccountUid: string
  ): Promise<ExternalBalance[]> {
    const data = await this.request(`/accounts/${providerAccountUid}/balances`, "GET");
    
    if (!data || !data.balances) {
      return [];
    }

    // Normalize balance to internal DTO
    return data.balances.reduce((acc: ExternalBalance[], b: any) => {
      const amountStr = b.balance_amount?.amount;
      const currency = b.balance_amount?.currency;
      if (amountStr === undefined || amountStr === null) return acc;
      if (!currency) return acc;

      const amount = Number(amountStr);
      if (!Number.isFinite(amount)) return acc;
      
      let referenceDate: Date | undefined;
      if (b.reference_date) {
        const parsed = new Date(b.reference_date);
        if (!isNaN(parsed.getTime())) {
          referenceDate = parsed;
        }
      }

      const balance: ExternalBalance = {
        amount,
        currency,
        type: b.balance_type,
        date: referenceDate,
      };


      acc.push(balance);
      return acc;
    }, []);
  }

  normalizeBalance(balances: ExternalBalance[]): ExternalBalance | null {
    if (!balances || balances.length === 0) return null;

    // Priority: ITBD > CLBD > ITAV > CLAV
    const priorities = ["ITBD", "CLBD", "ITAV", "CLAV"];
    
    for (const p of priorities) {
      const match = balances.find(b => b.type === p);
      if (match) return match;
    }

    // If none of the supported balance types are available, return null
    return null;
  }

  async getTransactions(
    providerAccountUid: string,
    options?: TransactionQuery
  ): Promise<TransactionResult> {
    const params = new URLSearchParams({
      transaction_status: "BOOK",
    });

    if (options?.continuationKey) {
      params.set("continuation_key", options.continuationKey);
    }
    if (options?.dateFrom) {
      params.set("date_from", options.dateFrom);
    }
    if (options?.strategy) {
      params.set("strategy", options.strategy);
    }

    const data = await this.request(`/accounts/${providerAccountUid}/transactions?${params.toString()}`, "GET");
    
    if (!data || !data.transactions) {
      return { transactions: [], skippedInvalid: 0 };
    }

    let skippedInvalid = 0;

    const transactions = data.transactions.reduce((acc: ExternalBankTransaction[], t: any) => {
      const amountStr = t.transaction_amount?.amount;
      const currency = t.transaction_amount?.currency;
      
      if (amountStr === undefined || amountStr === null) {
        skippedInvalid++;
        return acc;
      }
      
      const parsedAmount = Number(amountStr);
      if (!Number.isFinite(parsedAmount)) {
        skippedInvalid++;
        return acc;
      }
      
      if (!currency) {
        skippedInvalid++;
        return acc;
      }

      function parseSafeDate(d: any) {
        if (!d) return undefined;
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? undefined : parsed;
      }

      const bookingDate = parseSafeDate(t.booking_date);
      const valueDate = parseSafeDate(t.value_date);
      const transactionDate = parseSafeDate(t.transaction_date);

      const finalDate = bookingDate || transactionDate || valueDate;
      if (!finalDate) {
        skippedInvalid++;
        return acc; 
      }

      const ind = t.credit_debit_indicator;
      if (ind !== "CRDT" && ind !== "DBIT") {
        skippedInvalid++;
        return acc;
      }
      const creditDebitIndicator = ind === "CRDT" ? "CREDIT" : "DEBIT";

      const creditorName = t.creditor?.name;
      const debtorName = t.debtor?.name;
      const note = t.note;

      const code = t.bank_transaction_code?.code || "";
      const subCode = t.bank_transaction_code?.sub_code || "";
      const remittance = (t.remittance_information || []).join(" ");

      const fallbackHashString = [
         bookingDate?.toISOString() || "",
         valueDate?.toISOString() || "",
         transactionDate?.toISOString() || "",
         parsedAmount.toString(),
         currency,
         creditDebitIndicator,
         t.reference_number || "",
         remittance,
         creditorName || "",
         debtorName || "",
         t.merchant_category_code || "",
         code,
         subCode
      ].join("|");
      
      const fallbackHash = crypto.createHash('sha256').update(fallbackHashString).digest('hex');
      const entryReference = t.entry_reference;
      
      const dedupKey = entryReference ? `entry:${entryReference}` : `hash:${fallbackHash}`;

      let descPieces = [
        creditorName, 
        debtorName, 
        remittance, 
        t.bank_transaction_code?.description,
        note
      ].filter(Boolean);

      let description = descPieces.length > 0 ? descPieces.join(" - ") : "Bank transaction";
      if (description.length > 255) {
        description = description.substring(0, 250) + "...";
      }

      acc.push({
        dedupKey,
        entryReference,
        providerTransactionId: t.transaction_id,
        amount: Math.abs(parsedAmount),
        currency,
        date: finalDate,
        bookingDate,
        valueDate,
        transactionDate,
        description,
        creditDebitIndicator,
        status: t.status === "BOOK" ? "BOOKED" : "PENDING",
        referenceNumber: t.reference_number,
        remittanceInformation: t.remittance_information || [],
        creditorName,
        debtorName,
        merchantCategoryCode: t.merchant_category_code,
        bankTransactionCode: t.bank_transaction_code ? {
          code: t.bank_transaction_code.code,
          subCode: t.bank_transaction_code.sub_code,
          description: t.bank_transaction_code.description,
        } : undefined
      });

      return acc;
    }, []);

    return {
      transactions,
      continuationKey: data.continuation_key,
      skippedInvalid
    };
  }
}
