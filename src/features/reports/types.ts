export type SubmittedReportHistoryItem = {
  id: string;
  reportType: string;
  account: {
    id: string;
    name: string;
    type: string;
  };
  statementDate: string; // YYYY-MM-DD
  importedAt: string; // ISO string
  completeness: string;
  positionsCount: number;
  investedValue: number | null;
  investedCurrency: string | null;
  cashValue: number | null;
  cashCurrency: string | null;
  totalValue: number | null;
  totalCurrency: string | null;

  positions: Array<{
    id: string;
    name: string | null;
    sourceSection: string | null;
    assetClass: string | null;
    isin: string | null;
    ticker: string | null;
    instrumentIdentifier: string | null;
    instrumentIdentifierType: string | null;
    quantity: number | null;
    unitPrice: number | null;
    marketValue: number | null;
    currency: string | null;
    valuationDate: string | null;
  }>;
  cashBalances: Array<{
    id: string;
    type: string | null;
    label: string | null;
    amount: number;
    currency: string;
  }>;
  totals: Array<{
    id: string;
    type: string | null;
    label: string | null;
    amount: number;
    currency: string;
  }>;
  statementDateSource: string;
};

export type SnapshotEvidence = {
  positions: { marketValue?: number | null; currency?: string | null }[];
  cashBalances: { amount: number; currency: string }[];
  totals: Total[];
};

export type Total = {
  type: string | null;
  amount: number;
  currency: string;
};
