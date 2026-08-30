import { BrokerColumnSemantic, ColumnMapping } from "./types";

export const DETERMINISTIC_BROKER_MAPPINGS: Record<string, BrokerColumnSemantic> = {
  datetime: "DATETIME",
  date: "DATE",
  time: "DATETIME",
  
  type: "EVENT_TYPE",
  transaction_type: "EVENT_TYPE",
  action: "EVENT_TYPE",
  
  asset_class: "ASSET_CLASS",
  category: "SOURCE_CATEGORY",
  
  name: "INSTRUMENT_NAME",
  asset: "INSTRUMENT_NAME",
  instrument: "INSTRUMENT_NAME",
  
  symbol: "INSTRUMENT_IDENTIFIER",
  ticker: "TICKER",
  isin: "ISIN",
  identifier: "INSTRUMENT_IDENTIFIER",
  
  shares: "QUANTITY",
  quantity: "QUANTITY",
  amount_asset: "QUANTITY",
  
  price: "UNIT_PRICE",
  unit_price: "UNIT_PRICE",
  
  amount: "AMOUNT",
  total: "AMOUNT",
  value: "AMOUNT",
  
  fee: "FEE",
  fees: "FEE",
  commission: "FEE",
  
  tax: "TAX",
  taxes: "TAX",
  withholding_tax: "TAX",
  
  currency: "CURRENCY",
  ccy: "CURRENCY",
  
  original_amount: "ORIGINAL_AMOUNT",
  original_currency: "ORIGINAL_CURRENCY",
  
  fx_rate: "FX_RATE",
  exchange_rate: "FX_RATE",
  
  description: "DESCRIPTION",
  memo: "DESCRIPTION",
  notes: "DESCRIPTION",
  
  transaction_id: "EXTERNAL_ID"
};

export function mapBrokerColumnsDeterministically(
  headers: string[], 
  normalizedHeaders: string[]
): Record<number, ColumnMapping> {
  const mapping: Record<number, ColumnMapping> = {};

  normalizedHeaders.forEach((norm, idx) => {
    if (!norm) return;
    
    // Direct match
    if (DETERMINISTIC_BROKER_MAPPINGS[norm]) {
      mapping[idx] = {
        columnIndex: idx,
        header: headers[idx],
        semantic: DETERMINISTIC_BROKER_MAPPINGS[norm],
        confidence: 0.9,
        source: "deterministic"
      };
      return;
    }

    // Partial matches
    if (norm.includes("date") && norm.includes("time")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "DATETIME", confidence: 0.7, source: "deterministic" };
    } else if (norm.includes("date")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "DATE", confidence: 0.7, source: "deterministic" };
    } else if (norm.includes("isin")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "ISIN", confidence: 0.8, source: "deterministic" };
    } else if (norm.includes("ticker")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "TICKER", confidence: 0.8, source: "deterministic" };
    } else if (norm.includes("price")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "UNIT_PRICE", confidence: 0.6, source: "deterministic" };
    } else if (norm.includes("fee") || norm.includes("commission")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "FEE", confidence: 0.7, source: "deterministic" };
    } else if (norm.includes("tax")) {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "TAX", confidence: 0.7, source: "deterministic" };
    } else if (norm.includes("id") || norm.includes("reference")) {
      // Conservative EXTERNAL_ID mapping
      if (norm === "transaction_id" || norm === "transactionid") {
        mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: "EXTERNAL_ID", confidence: 0.8, source: "deterministic" };
      } else {
        mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: null, confidence: 0, source: null };
      }
    } else {
      mapping[idx] = { columnIndex: idx, header: headers[idx], semantic: null, confidence: 0, source: null };
    }
  });

  return mapping;
}
