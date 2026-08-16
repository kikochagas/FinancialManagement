export interface BankInstitution {
  id: string;
  name: string;
  country: string;
  logo?: string;
  maximumConsentValidity?: number;
}

export interface BankAuthorization {
  url: string;
  providerAuthorizationId?: string;
}

export interface BankConnectionResult {
  providerSessionId: string;
  validUntil?: Date;
  accountsData?: any; // The initial accounts payload returned by POST /sessions
}

export interface ExternalBankAccount {
  uid: string;
  identificationHash: string;
  name: string;
  currency: string;
  balance?: number;
}

export interface ExternalBalance {
  amount: number;
  currency: string;
  type: string;
  date?: Date;
}

export interface ExternalBankTransaction {
  dedupKey: string;
  entryReference?: string;
  providerTransactionId?: string;
  
  bookingDate?: Date;
  valueDate?: Date;
  transactionDate?: Date;
  date: Date; // Fallback normalized date

  amount: number;
  currency: string;

  creditDebitIndicator: "CREDIT" | "DEBIT";
  status: "PENDING" | "BOOKED";

  referenceNumber?: string;
  remittanceInformation: string[];

  creditorName?: string;
  debtorName?: string;

  merchantCategoryCode?: string;

  bankTransactionCode?: {
    code?: string;
    subCode?: string;
    description?: string;
  };

  description: string;
}

export interface TransactionQuery {
  continuationKey?: string;
  dateFrom?: string; // YYYY-MM-DD
  strategy?: "longest" | "default";
}

export interface TransactionResult {
  transactions: ExternalBankTransaction[];
  continuationKey?: string;
  skippedInvalid: number;
}

export interface BankingProvider {
  getInstitutions(country: string): Promise<BankInstitution[]>;

  createAuthorization(
    institutionName: string,
    institutionCountry: string,
    callbackUrl: string,
    state: string,
    maximumConsentValiditySeconds: number
  ): Promise<BankAuthorization>;

  completeAuthorization(
    code: string,
    redirectUri: string
  ): Promise<BankConnectionResult>;



  getBalances(
    providerAccountUid: string
  ): Promise<ExternalBalance[]>;

  normalizeBalance(balances: ExternalBalance[]): ExternalBalance | null;

  getTransactions(
    providerAccountUid: string,
    options?: TransactionQuery
  ): Promise<TransactionResult>;
}
