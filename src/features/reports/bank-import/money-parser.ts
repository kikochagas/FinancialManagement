import { ParseResult } from "./types";

/**
 * Deterministic money parser.
 * Supports:
 * - -14,74 €
 * - 1.657,60 €
 * - -4.000,00
 * - 1,657.60
 * 
 * Never returns 0 for invalid input unless the input is genuinely zero.
 */
export function parseMoneyStrict(input: any): ParseResult<number> & { currency?: string, explicitSign?: "positive" | "negative" | null } {
  if (input === null || input === undefined || input === "") {
    return { valid: false, value: null, warning: "Missing amount" };
  }

  if (typeof input === "number") {
    if (!isFinite(input)) return { valid: false, value: null, warning: "Amount is not finite" };
    return { valid: true, value: Number(input.toFixed(2)), explicitSign: input < 0 ? "negative" : null };
  }

  let str = String(input).trim();
  let explicitSign: "positive" | "negative" | null = null;
  
  if (str.includes('+')) explicitSign = "positive";
  else if (str.includes('-')) explicitSign = "negative";

  let currency: string | undefined;
  
  const startMatch = str.match(/^(€|\$|£|EUR|USD|GBP)\s*/i);
  const endMatch = str.match(/\s*(€|\$|£|EUR|USD|GBP)$/i);
  
  if (startMatch) {
     const rawCurr = startMatch[1].toUpperCase();
     // Rule A: Bare $ is ambiguous globally. Only £ and € are mapped.
     currency = rawCurr === '€' ? 'EUR' : rawCurr === '£' ? 'GBP' : rawCurr === '$' ? undefined : rawCurr;
     str = str.replace(startMatch[0], '');
  } else if (endMatch) {
     const rawCurr = endMatch[1].toUpperCase();
     currency = rawCurr === '€' ? 'EUR' : rawCurr === '£' ? 'GBP' : rawCurr === '$' ? undefined : rawCurr;
     str = str.replace(endMatch[0], '');
  }

  // Reject embedded or multiple currencies
  if (/(€|\$|£|EUR|USD|GBP)/i.test(str)) {
    return { valid: false, value: null, warning: "Multiple or embedded currencies detected", explicitSign };
  }

  str = str.replace(/\s+/g, '');
  if (str === "") return { valid: false, value: null, warning: "Empty amount string" };

  if (/^[-+]?\d+[.,]\d{3}$/.test(str)) {
    return { valid: false, value: null, warning: "Ambiguous number format", explicitSign, currency };
  }

  if (/^[-+]?\d{1,3}([.,]\d{3}){2,}$/.test(str)) {
    return { valid: false, value: null, warning: "Ambiguous number format", explicitSign, currency };
  }

  const isEU = /^[-+]?(?:\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)$/.test(str);
  const isUS = /^[-+]?(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/.test(str);

  if (!isEU && !isUS) {
    return { valid: false, value: null, warning: `Invalid amount format: ${input}`, explicitSign, currency };
  }

  if (isEU && !isUS) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (isUS && !isEU) {
    str = str.replace(/,/g, '');
  }

  const num = parseFloat(str);

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: null, warning: `Invalid amount format: ${input}` };
  }

  return { valid: true, value: Number(num.toFixed(2)), currency, explicitSign };
}
