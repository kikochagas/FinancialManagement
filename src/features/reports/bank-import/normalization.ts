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
export function deriveTransactionType(
  amount: number | null,
  explicitType: string | null,
  debit: any,
  credit: any
): "Income" | "Expense" | null {
  if (explicitType) {
    const t = explicitType.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (t === "credito" || t === "credit" || t === "crdt" || t.includes("income") || t === "+") return "Income";
    if (t === "debito" || t === "debit" || t === "dbit" || t.includes("expense") || t === "-") return "Expense";
  }

  if (amount !== null) {
    if (amount > 0) return "Income";
    if (amount < 0) return "Expense";
    return null; // 0 amount needs manual review unless explicit TYPE provides it
  }

  if (debit !== undefined && debit !== null && debit !== "") return "Expense";
  if (credit !== undefined && credit !== null && credit !== "") return "Income";

  return null;
}

/**
 * Unified amount resolution from either a single AMOUNT column or DEBIT/CREDIT columns.
 */
export function resolveAmount(
  amountRaw: any,
  debitRaw: any,
  creditRaw: any
): { amount: number | null; type: "Income" | "Expense" | null; explicitSign: boolean; warnings: string[]; currency?: string } {
  const warnings: string[] = [];

  const hasDebit = debitRaw !== undefined && debitRaw !== null && String(debitRaw).trim() !== "";
  const hasCredit = creditRaw !== undefined && creditRaw !== null && String(creditRaw).trim() !== "";

  if (hasDebit && hasCredit) {
    warnings.push("Both Debit and Credit columns contain values. Type is ambiguous.");
    return { amount: null, type: null, explicitSign: false, warnings, currency: undefined };
  }

  if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
    const res = parseMoneyStrict(amountRaw);
    if (!res.valid) warnings.push(res.warning!);
    
    const explicitSignFlag = res.explicitSign !== null;
    let type = deriveTransactionType(res.value !== null ? Math.abs(res.value) : null, null, null, null);
    
    // Explicit sign overrides the absolute value's lack of sign
    if (res.explicitSign === "positive") type = "Income";
    if (res.explicitSign === "negative") type = "Expense";
    
    return { 
      amount: res.value !== null ? Math.abs(res.value) : null, 
      type, 
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
      type: "Income", 
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
      type: "Expense", 
      explicitSign: true,
      warnings,
      currency: res.currency
    };
  }

  warnings.push("Missing amount or debit/credit values.");
  return { amount: null, type: null, explicitSign: false, warnings, currency: undefined };
}
