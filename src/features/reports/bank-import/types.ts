export type BankColumnSemantic =
  | "BOOKING_DATE"
  | "VALUE_DATE"
  | "DESCRIPTION"
  | "AMOUNT"
  | "DEBIT"
  | "CREDIT"
  | "TYPE"
  | "BALANCE_AFTER"
  | "CURRENCY"
  | "COUNTERPARTY"
  | "PAYER"
  | "BENEFICIARY"
  | "IBAN"
  | "REFERENCE"
  | "IGNORE"
  | "UNMAPPED";

export type MappingSource = "deterministic" | "ai" | "user";

export interface ColumnMapping {
  columnIndex: number;
  header: string;
  semantic: BankColumnSemantic | null; // null means "Unmapped"
  confidence: number;
  source: MappingSource | null;
}

export interface ParseResult<T> {
  valid: boolean;
  value: T | null;
  warning?: string;
}

export type ValueShape = 
  | "EMPTY"
  | "DATE_DD_MM_YYYY"
  | "DATE_ISO"
  | "EXCEL_DATE_SERIAL"
  | "NEGATIVE_EUR_AMOUNT"
  | "POSITIVE_EUR_AMOUNT"
  | "NEGATIVE_NUMBER"
  | "POSITIVE_NUMBER"
  | "CURRENCY_CODE"
  | "IBAN"
  | "ACCOUNT_IDENTIFIER"
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "UNKNOWN_TEXT";

export interface AISanitizedColumnInfo {
  index: number;
  normalizedHeader: string;
  valueShapes: ValueShape[];
}

export type TransactionDirection = "Debit" | "Credit";

export interface ParsedBankTransaction {
  sourceRow: number;
  bookingDate: string | null;
  valueDate?: string | null;
  description: string;
  amount: number | null;
  direction: TransactionDirection | null;
  balanceAfter?: number | null;
  counterparty?: string | null;
  currency?: string | null;
  payer?: string | null;
  beneficiary?: string | null;
  iban?: string | null;
  reference?: string | null;
  
  // Computed fields during validation
  valid: boolean;
  warnings: string[];
  currencyConflict?: boolean;
  isProbableDuplicate?: boolean;
  isCategorySuggested?: boolean;
}

export interface BankStatementParseResult {
  sheetName: string;
  headerRow: number | null;
  deterministicConfidence: number;
  aiUsed: boolean;
  aiConfidence?: number;
  mapping: Record<number, ColumnMapping>;
  transactions: ParsedBankTransaction[];
  endingBalance?: number | null;
  warnings: string[];
  skippedRows: number;
}
