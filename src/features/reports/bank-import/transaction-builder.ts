import { ColumnMapping, ParsedBankTransaction } from "./types";
import { resolveAmount, normalizeTransactionDescription, deriveTransactionType } from "./normalization";
import { validateTransaction } from "./validation";
import { parseDateStrict } from "./date-parser";
import { parseMoneyStrict } from "./money-parser";

function normalizeCurrency(c: any): string | null {
  if (!c) return null;
  const s = String(c).trim().toLowerCase();
  if (s === '€' || s === 'eur') return 'EUR';
  if (s === 'usd') return 'USD';
  if (s === '£' || s === 'gbp') return 'GBP';
  if (s === '$') return null;
  return String(c).trim().toUpperCase();
}

export function buildTransactions(
  dataRows: any[][],
  headerRowIdx: number,
  mapping: Record<number, ColumnMapping>
): { transactions: ParsedBankTransaction[], endingBalance: number | null, footerRowsSkipped: number, blankRowsIgnored: number, statementCurrencyStatus: "detected" | "unknown" | "ambiguous", statementCurrency: string | null } {
  const txs: ParsedBankTransaction[] = [];
  let detectedEndingBalance: number | null = null;
  let skippedRows = 0;
  let blankRowsIgnored = 0;

  for (let i = headerRowIdx + 1; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0 || row.every(c => c === "" || c === null || c === undefined)) {
      blankRowsIgnored++;
      continue;
    }

    let bookingDateRaw: any = null;
    let valueDateRaw: any = null;
    let descRaw: any = null;
    let amtRaw: any = null;
    let debitRaw: any = null;
    let creditRaw: any = null;
    let typeRaw: any = null;
    let balanceRaw: any = null;
    let counterpartyRaw: any = null;
    let payerRaw: any = null;
    let beneficiaryRaw: any = null;
    let ibanRaw: any = null;
    let currencyRaw: any = null;
    let referenceRaw: any = null;

    Object.values(mapping).forEach(m => {
      if (!m.semantic || m.semantic === "IGNORE" || m.semantic === "UNMAPPED") return;
      const val = row[m.columnIndex];
      if (m.semantic === "BOOKING_DATE") bookingDateRaw = val;
      if (m.semantic === "VALUE_DATE") valueDateRaw = val;
      if (m.semantic === "DESCRIPTION") descRaw = val;
      if (m.semantic === "AMOUNT") amtRaw = val;
      if (m.semantic === "DEBIT") debitRaw = val;
      if (m.semantic === "CREDIT") creditRaw = val;
      if (m.semantic === "TYPE") typeRaw = val;
      if (m.semantic === "BALANCE_AFTER") balanceRaw = val;
      if (m.semantic === "COUNTERPARTY") counterpartyRaw = val;
      if (m.semantic === "PAYER") payerRaw = val;
      if (m.semantic === "BENEFICIARY") beneficiaryRaw = val;
      if (m.semantic === "IBAN") ibanRaw = val;
      if (m.semantic === "CURRENCY") currencyRaw = val;
      if (m.semantic === "REFERENCE") referenceRaw = val;
    });

    const bookingDateRes = parseDateStrict(bookingDateRaw);
    const valueDateRes = valueDateRaw ? parseDateStrict(valueDateRaw) : null;
    
    const { amount, type: inferredType, explicitSign, warnings, currency: extractedCurrency } = resolveAmount(amtRaw, debitRaw, creditRaw);

    const hasValidDate = bookingDateRes.valid;
    const hasValidAmount = amount !== null;
    const hasMeaningfulDescription = descRaw != null && String(descRaw).trim() !== "";
    const hasAnyTypeOrRef = (typeRaw !== undefined && typeRaw !== null && String(typeRaw).trim() !== "") || 
                            (referenceRaw !== undefined && referenceRaw !== null && String(referenceRaw).trim() !== "");

    if (!hasValidDate && !hasValidAmount && !hasMeaningfulDescription && !hasAnyTypeOrRef) {
      skippedRows++;
      continue;
    }

    // Resolve TYPE conflict
    let finalType = inferredType;
    if (typeRaw) {
      const explicit = deriveTransactionType(null, String(typeRaw), null, null);
      if (explicit) {
        if (finalType && explicit !== finalType) {
          if (explicitSign) {
            warnings.push(`Sign and Type column conflict: Amount suggests ${finalType}, but Type column says ${explicit}.`);
            finalType = null; // Unresolved conflict forces manual review
          } else {
             // Yield to explicit TYPE
             finalType = explicit;
          }
        } else {
          finalType = explicit;
        }
      }
    }

    if (!bookingDateRes.valid) warnings.push(bookingDateRes.warning || "Invalid Date");

    let finalCurrency = null;
    let currencyConflict = false;
    const mappedCurrency = currencyRaw ? normalizeCurrency(currencyRaw) : null;
    const extractedCurrNorm = extractedCurrency ? normalizeCurrency(extractedCurrency) : null;
    
    if (mappedCurrency && extractedCurrNorm) {
      if (mappedCurrency !== extractedCurrNorm) {
        warnings.push(`Currency conflict: Amount suggests ${extractedCurrNorm}, but Currency column says ${mappedCurrency}.`);
        currencyConflict = true;
      } else {
        finalCurrency = mappedCurrency;
      }
    } else {
      finalCurrency = mappedCurrency || extractedCurrNorm || null;
    }

    let tx: ParsedBankTransaction = {
      sourceRow: i,
      bookingDate: bookingDateRes.valid ? bookingDateRes.value : null,
      valueDate: valueDateRes?.valid ? valueDateRes.value : null,
      description: normalizeTransactionDescription(descRaw),
      amount: amount ?? null,
      type: finalType ?? null,
      balanceAfter: balanceRaw !== undefined && balanceRaw !== null && balanceRaw !== "" ? parseMoneyStrict(balanceRaw).value : null,
      counterparty: counterpartyRaw ? String(counterpartyRaw).trim() : null,
      payer: payerRaw ? String(payerRaw).trim() : null,
      beneficiary: beneficiaryRaw ? String(beneficiaryRaw).trim() : null,
      iban: ibanRaw ? String(ibanRaw).trim() : null,
      currency: finalCurrency,
      reference: referenceRaw ? String(referenceRaw).trim() : null,
      valid: false,
      warnings,
      currencyConflict
    };

    tx = validateTransaction(tx);
    txs.push(tx);
  }

  // Track ending balance logic natively by direction
  const validTxs = txs.filter(t => t.valid && t.balanceAfter !== null);
  if (validTxs.length >= 2) {
    const firstDate = new Date(validTxs[0].bookingDate!).getTime();
    const lastDate = new Date(validTxs[validTxs.length - 1].bookingDate!).getTime();
    if (lastDate > firstDate) {
      // Oldest to newest
      detectedEndingBalance = validTxs[validTxs.length - 1].balanceAfter ?? null;
    } else if (firstDate > lastDate) {
      // Newest to oldest
      detectedEndingBalance = validTxs[0].balanceAfter ?? null;
    } else {
      // Ambiguous statement order
      detectedEndingBalance = null;
    }
  } else if (validTxs.length === 1) {
    detectedEndingBalance = validTxs[0].balanceAfter ?? null;
  }

  // Detect statement currency safely across all rows
  let statementCurrencyStatus: "detected" | "unknown" | "ambiguous" = "unknown";
  let detectedStatementCurrency: string | null = null;
  
  const validCurrencies = new Set<string>();
  let hasConflicts = false;

  for (const t of txs) {
    if (t.currencyConflict) {
      hasConflicts = true;
      break;
    }
    if (t.currency) {
      validCurrencies.add(t.currency);
    }
  }

  if (hasConflicts || validCurrencies.size > 1) {
    statementCurrencyStatus = "ambiguous";
  } else if (validCurrencies.size === 1) {
    statementCurrencyStatus = "detected";
    detectedStatementCurrency = Array.from(validCurrencies)[0];
  }

  return { transactions: txs, endingBalance: detectedEndingBalance, footerRowsSkipped: skippedRows, blankRowsIgnored, statementCurrencyStatus, statementCurrency: detectedStatementCurrency };
}
