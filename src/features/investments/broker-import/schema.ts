import { z } from 'zod';

// ---------------------------------------------------------------------------
// Date provenance: how the statement/valuation date was determined
// ---------------------------------------------------------------------------
const DateProvenanceEnum = z.enum([
  'DOCUMENT',        // Explicitly stated in the document (e.g. "Statement Date: 2024-01-31")
  'USER_CONFIRMED',  // Provided or confirmed by the user, not extracted from document text
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// Document completeness
// ---------------------------------------------------------------------------
const CompletenessEnum = z.enum([
  'COMPLETE',   // All expected sections are present and parseable
  'PARTIAL',    // Some sections missing or unparseable
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// Capabilities: what data kinds this snapshot contains
// ---------------------------------------------------------------------------
const CapabilityEnum = z.enum([
  'SNAPSHOT_DATE',    // Document carries an explicit valuation/statement date
  'CASH_BALANCES',    // Cash balances present
  'POSITIONS',        // Holdings / positions present
  'QUANTITIES',       // Quantity per position available
  'PRICES',           // Unit price per position available
  'MARKET_VALUES',    // Market value per position available
  'PORTFOLIO_TOTALS', // Aggregate portfolio totals (invested, overall, section)
  'ACTIVITY',         // Activity / transaction section present
  'COST_BASIS',       // Cost basis per position available
  'PNL',              // Unrealised P&L per position available
]);

// ---------------------------------------------------------------------------
// Cash type: describes the settlement/availability semantics of the cash entry
// ---------------------------------------------------------------------------
const CashTypeEnum = z.enum([
  'TOTAL',       // Sum of all cash (may include settled + unsettled)
  'SETTLED',     // Cleared / settled cash available to withdraw
  'AVAILABLE',   // Buying power / available to invest (may differ from settled)
  'UNSETTLED',   // Pending settlement
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// Total type: what the aggregate figure represents in broker-generic terms
// ---------------------------------------------------------------------------
const TotalTypeEnum = z.enum([
  'CASH',          // Cash component of the portfolio
  'INVESTED',      // Cost/invested capital total
  'OVERALL',       // Overall portfolio value (cash + positions)
  'SECTION_TOTAL', // A sub-section total (e.g. per asset class)
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// Position: one holding line from the broker report
// ---------------------------------------------------------------------------
const PositionSchema = z.object({
  // Identity
  name: z.string().nullable(),
  sourceSection: z.string().nullable(),         // Which section/table this came from
  assetClass: z.string().nullable(),

  // Identifiers
  isin: z.string().nullable(),
  ticker: z.string().nullable(),                // Maps to Investment.symbol on reconciliation
  instrumentIdentifier: z.string().nullable(),  // Generic fallback identifier (e.g. CUSIP, SEDOL)
  instrumentIdentifierType: z.string().nullable(),

  // Valuation
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  currency: z.string().nullable(),

  // Optional enrichment
  costBasis: z.number().nullable().optional(),
  pnl: z.number().nullable().optional(),

  // Per-position valuation date — a report may value positions on different dates
  valuationDate: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Cash balance entry
// ---------------------------------------------------------------------------
const CashBalanceSchema = z.object({
  type: CashTypeEnum.nullable(),
  label: z.string().nullable(),
  currency: z.string(),
  amount: z.number(),
});

// ---------------------------------------------------------------------------
// Aggregate total entry
// ---------------------------------------------------------------------------
const SnapshotTotalSchema = z.object({
  type: TotalTypeEnum,
  label: z.string().nullable(),
  currency: z.string(),
  amount: z.number(),
});

// ---------------------------------------------------------------------------
// Top-level BrokerSnapshot
// ---------------------------------------------------------------------------
export const BrokerSnapshotSchema = z.object({
  // Document-level date (e.g. "Statement as of 2024-01-31") — may differ from per-position dates
  statementDate: z.string().nullable().optional(),
  dateProvenance: DateProvenanceEnum.optional(),

  // Document-level fallback valuation date (if all positions share the same date and it differs
  // from the statement date, record it here; prefer per-position valuationDate for heterogeneous docs)
  valuationDate: z.string().nullable().optional(),

  documentFingerprint: z.string().optional(),

  completeness: CompletenessEnum,
  capabilities: z.array(CapabilityEnum).optional(),

  positions: z.array(PositionSchema),
  cashBalances: z.array(CashBalanceSchema),
  totals: z.array(SnapshotTotalSchema),

  extractionWarnings: z.array(z.string()).optional(),
});

export type BrokerSnapshot = z.infer<typeof BrokerSnapshotSchema>;
export type BrokerPosition = z.infer<typeof PositionSchema>;
export type BrokerCashBalance = z.infer<typeof CashBalanceSchema>;
export type BrokerSnapshotTotal = z.infer<typeof SnapshotTotalSchema>;
