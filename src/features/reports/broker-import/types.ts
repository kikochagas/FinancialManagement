export type BrokerColumnSemantic =
  | "DATETIME"
  | "DATE"
  | "EVENT_TYPE"
  | "SOURCE_CATEGORY"
  | "ASSET_CLASS"
  | "INSTRUMENT_NAME"
  | "INSTRUMENT_IDENTIFIER"
  | "ISIN"
  | "TICKER"
  | "QUANTITY"
  | "UNIT_PRICE"
  | "AMOUNT"
  | "FEE"
  | "TAX"
  | "CURRENCY"
  | "ORIGINAL_AMOUNT"
  | "ORIGINAL_CURRENCY"
  | "FX_RATE"
  | "DESCRIPTION"
  | "EXTERNAL_ID"
  | "IGNORE"
  | "UNMAPPED";

export type CanonicalEventType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "INTEREST"
  | "CASH_DEPOSIT"
  | "CASH_WITHDRAWAL"
  | "ASSET_TRANSFER_IN"
  | "ASSET_TRANSFER_OUT"
  | "FEE"
  | "TAX"
  | "CORPORATE_ACTION"
  | "OTHER";

export type MappingSource = "deterministic" | "ai" | "user";

export interface ColumnMapping {
  columnIndex: number;
  header: string;
  semantic: BrokerColumnSemantic | null;
  confidence: number;
  source: MappingSource | null;
}

export type ValueShape = 
  | "EMPTY"
  | "DATE_DD_MM_YYYY"
  | "DATE_ISO"
  | "DATETIME_ISO"
  | "EXCEL_DATE_SERIAL"
  | "NEGATIVE_NUMBER"
  | "POSITIVE_NUMBER"
  | "CURRENCY_CODE"
  | "ISIN_LIKE"
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "UNKNOWN_TEXT";

export interface AISanitizedColumnInfo {
  index: number;
  normalizedHeader: string;
  valueShapes: ValueShape[];
}

export interface ParseResult<T> {
  valid: boolean;
  value: T | null;
  warning?: string;
}

export interface ParsedBrokerTransaction {
  sourceRow: number;
  
  occurredAt: string | null; // ISO datetime string
  
  eventType: CanonicalEventType | "IGNORE" | null; // Note: IGNORE is permitted during preview
  rawEventType: string | null;
  rawCategory: string | null;
  
  assetClass: string | null;
  instrumentName: string | null;
  instrumentIdentifier: string | null;
  isin: string | null;
  ticker: string | null;
  
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  fee: number | null;
  tax: number | null;
  currency: string | null;
  
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  
  description: string | null;
  externalId: string | null;
  
  // Computed fields during validation
  valid: boolean;
  warnings: string[];
  isProbableDuplicate?: boolean;
}

export interface BrokerTransactionParseResult {
  sheetName: string;
  headerRow: number | null;
  deterministicConfidence: number;
  aiUsed: boolean;
  aiConfidence?: number;
  mapping: Record<number, ColumnMapping>;
  transactions: ParsedBrokerTransaction[];
  warnings: string[];
  skippedRows: number;
}
