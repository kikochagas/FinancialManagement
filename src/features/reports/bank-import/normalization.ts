import { ParsedBankTransaction } from "./types";
import { parseDateStrict } from "./date-parser";
import { parseMoneyStrict } from "./money-parser";

/**
 * Normalizes raw transaction string description.
 */
export function normalizeTransactionDescription(desc: string | null | undefined): string {
  if (!desc) return "Imported Transaction";
  return desc.toString().trim().replace(/\s+/g, " ");
}

/**
 * Derives the transaction type based on available data.
 * If type is explicit, uses it.
 * Otherwise infers from amount sign or debit/credit semantics.
 */
export function deriveTransactionDirection(
  amount: number | null,
  explicitType: string | null,
  debit: any,
  credit: any
): "Debit" | "Credit" | null {
  if (explicitType) {
    const t = explicitType.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (t === "credito" || t === "credit" || t === "crdt" || t.includes("income") || t === "+") return "Credit";
    if (t === "debito" || t === "debit" || t === "dbit" || t.includes("expense") || t === "-") return "Debit";
  }

  if (amount !== null) {
    if (amount > 0) return "Credit";
    if (amount < 0) return "Debit";
    return null; // 0 amount needs manual review unless explicit TYPE provides it
  }

  if (debit !== undefined && debit !== null && debit !== "") return "Debit";
  if (credit !== undefined && credit !== null && credit !== "") return "Credit";

  return null;
}

/**
 * Unified amount resolution from either a single AMOUNT column or DEBIT/CREDIT columns.
 */
export function resolveAmount(
  amountRaw: any,
  debitRaw: any,
  creditRaw: any
): { amount: number | null; direction: "Debit" | "Credit" | null; explicitSign: boolean; warnings: string[]; currency?: string } {
  const warnings: string[] = [];

  const hasDebit = debitRaw !== undefined && debitRaw !== null && String(debitRaw).trim() !== "";
  const hasCredit = creditRaw !== undefined && creditRaw !== null && String(creditRaw).trim() !== "";

  if (hasDebit && hasCredit) {
    warnings.push("Both Debit and Credit columns contain values. Type is ambiguous.");
    return { amount: null, direction: null, explicitSign: false, warnings, currency: undefined };
  }

  if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
    const res = parseMoneyStrict(amountRaw);
    if (!res.valid) warnings.push(res.warning!);
    
    const explicitSignFlag = res.explicitSign !== null;
    let direction = deriveTransactionDirection(res.value !== null ? Math.abs(res.value) : null, null, null, null);
    
    // Explicit sign overrides the absolute value's lack of sign
    if (res.explicitSign === "positive") direction = "Credit";
    if (res.explicitSign === "negative") direction = "Debit";
    
    return { 
      amount: res.value !== null ? Math.abs(res.value) : null, 
      direction, 
      explicitSign: explicitSignFlag,
      warnings,
      currency: res.currency
    };
  }

  if (hasCredit) {
    const res = parseMoneyStrict(creditRaw);
    if (!res.valid) warnings.push(res.warning!);
    return { 
      amount: res.value !== null ? Math.abs(res.value) : null, 
      direction: "Credit", 
      explicitSign: true,
      warnings,
      currency: res.currency
    };
  }

  if (hasDebit) {
    const res = parseMoneyStrict(debitRaw);
    if (!res.valid) warnings.push(res.warning!);
    return { 
      amount: res.value !== null ? Math.abs(res.value) : null, 
      direction: "Debit", 
      explicitSign: true,
      warnings,
      currency: res.currency
    };
  }

  warnings.push("Missing amount or debit/credit values.");
  return { amount: null, direction: null, explicitSign: false, warnings, currency: undefined };
}
