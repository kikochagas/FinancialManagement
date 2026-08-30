import * as XLSX from "xlsx";
import { BrokerTransactionParseResult, ParsedBrokerTransaction, ColumnMapping, BrokerColumnSemantic } from "./types";
import { detectHeaderRow, normalizeHeader } from "./header-detection";
import { mapBrokerColumnsDeterministically } from "./column-mapping";
import { evaluateBrokerMappingConfidence } from "./confidence";
import { parseBrokerDatetimeStrict } from "./date-parser";
import { parseBrokerNumberStrict } from "./number-parser";
import { normalizeEventType } from "./event-type-normalization";
import { normalizeIdentifier } from "./identifier-normalization";
import { validateBrokerTransaction } from "./validation";
import { getSheetData, determineBestSheet } from "../bank-import/workbook"; // Reuse workbook extractors

export async function parseBrokerTransactions(
  rows: any[][],
  userMapping?: Record<number, ColumnMapping>,
  eventTypeOverrides?: Record<string, string>,
  explicitHeaderRowIdx?: number
): Promise<BrokerTransactionParseResult> {
  if (!rows || rows.length === 0) throw new Error("File is empty");

  const headerRowIdx = explicitHeaderRowIdx !== undefined ? explicitHeaderRowIdx : detectHeaderRow(rows);
  let headers: string[] = [];
  let normalizedHeaders: string[] = [];
  let mapping: Record<number, ColumnMapping> = userMapping || {};
  let deterministicConfidence = 0;
  
  if (headerRowIdx !== null) {
    headers = rows[headerRowIdx].map(h => String(h || "").trim());
    normalizedHeaders = headers.map(normalizeHeader);
    
    if (!userMapping) {
      mapping = mapBrokerColumnsDeterministically(headers, normalizedHeaders);
      deterministicConfidence = evaluateBrokerMappingConfidence(mapping);
    }
  }

  const transactions: ParsedBrokerTransaction[] = [];
  let skippedRows = 0;
  const dataStart = headerRowIdx !== null ? headerRowIdx + 1 : 0;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(c => c === "" || c === undefined || c === null)) {
      skippedRows++;
      continue;
    }

    const tx: ParsedBrokerTransaction = {
      sourceRow: i,
      occurredAt: null,
      eventType: null,
      rawEventType: null,
      rawCategory: null,
      assetClass: null,
      instrumentName: null,
      instrumentIdentifier: null,
      isin: null,
      ticker: null,
      quantity: null,
      unitPrice: null,
      amount: null,
      fee: null,
      tax: null,
      currency: null,
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
      description: null,
      externalId: null,
      valid: false,
      warnings: []
    };

    let tempDate: string | null = null;
    let tempDatetime: string | null = null;

    let explicitISIN: string | null = null;
    let explicitTicker: string | null = null;
    let rawIdentifier: string | null = null;

    Object.values(mapping).forEach(m => {
      if (!m.semantic || m.semantic === "IGNORE" || m.semantic === "UNMAPPED") return;
      const rawVal = row[m.columnIndex];
      if (rawVal === undefined || rawVal === null || rawVal === "") return;

      const strVal = String(rawVal).trim();
      if (strVal === "") return;

      switch (m.semantic) {
        case "DATETIME": {
          const res = parseBrokerDatetimeStrict(rawVal);
          if (res.valid) tempDatetime = res.value;
          else tx.warnings.push(res.warning || "Invalid DATETIME");
          break;
        }
        case "DATE": {
          const res = parseBrokerDatetimeStrict(rawVal);
          if (res.valid) tempDate = res.value;
          else tx.warnings.push(res.warning || "Invalid DATE");
          break;
        }
        case "EVENT_TYPE": {
          tx.rawEventType = strVal;
          if (eventTypeOverrides && eventTypeOverrides[tx.rawEventType]) {
            tx.eventType = eventTypeOverrides[tx.rawEventType] as any;
            if (tx.eventType === "IGNORE" as any) {
               // Special case
            }
          } else {
            tx.eventType = normalizeEventType(tx.rawEventType);
          }
          break;
        }
        case "SOURCE_CATEGORY":
          tx.rawCategory = strVal;
          break;
        case "ASSET_CLASS":
          tx.assetClass = strVal;
          break;
        case "INSTRUMENT_NAME":
          tx.instrumentName = strVal;
          break;
        case "INSTRUMENT_IDENTIFIER":
          rawIdentifier = strVal;
          break;
        case "ISIN":
          explicitISIN = strVal;
          break;
        case "TICKER":
          explicitTicker = strVal;
          break;
        case "QUANTITY": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.quantity = res.value;
          else tx.warnings.push(res.warning || "Invalid Quantity");
          break;
        }
        case "UNIT_PRICE": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.unitPrice = res.value;
          else tx.warnings.push(res.warning || "Invalid Unit Price");
          break;
        }
        case "AMOUNT": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) {
            tx.amount = res.value;
            if (res.currency && !tx.currency) tx.currency = res.currency;
          } else tx.warnings.push(res.warning || "Invalid Amount");
          break;
        }
        case "FEE": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.fee = res.value;
          else tx.warnings.push(res.warning || "Invalid Fee");
          break;
        }
        case "TAX": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.tax = res.value;
          else tx.warnings.push(res.warning || "Invalid Tax");
          break;
        }
        case "CURRENCY":
          tx.currency = strVal.toUpperCase();
          break;
        case "ORIGINAL_AMOUNT": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.originalAmount = res.value;
          else tx.warnings.push(res.warning || "Invalid Original Amount");
          break;
        }
        case "ORIGINAL_CURRENCY":
          tx.originalCurrency = strVal.toUpperCase();
          break;
        case "FX_RATE": {
          const res = parseBrokerNumberStrict(rawVal);
          if (res.valid) tx.fxRate = res.value;
          else tx.warnings.push(res.warning || "Invalid FX Rate");
          break;
        }
        case "DESCRIPTION":
          tx.description = strVal;
          break;
        case "EXTERNAL_ID":
          tx.externalId = strVal;
          break;
      }
    });

    tx.occurredAt = tempDatetime || tempDate;

    const idNorm = normalizeIdentifier(rawIdentifier, explicitISIN, explicitTicker);
    tx.instrumentIdentifier = idNorm.instrumentIdentifier;
    tx.isin = idNorm.isin;
    tx.ticker = idNorm.ticker;

    validateBrokerTransaction(tx);
    transactions.push(tx);
  }

  return {
    sheetName: "Import",
    headerRow: headerRowIdx,
    deterministicConfidence,
    aiUsed: false,
    mapping,
    transactions,
    warnings: [],
    skippedRows
  };
}
