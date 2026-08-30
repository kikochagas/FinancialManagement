import { ParseResult } from "./types";

/**
 * Deterministic number parser for broker imports.
 * Supports handling precision up to multiple decimals (e.g., crypto),
 * while preserving explicit signs (+ or -).
 * Never uses .toFixed(2) to truncate value.
 */
export function parseBrokerNumberStrict(input: any): ParseResult<number> & { currency?: string, explicitSign?: "positive" | "negative" | null } {
  if (input === null || input === undefined || input === "") {
    return { valid: false, value: null, warning: "Missing amount" };
  }

  if (typeof input === "number") {
    if (!isFinite(input)) return { valid: false, value: null, warning: "Amount is not finite" };
    return { valid: true, value: input, explicitSign: input < 0 ? "negative" : null };
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
     currency = rawCurr === '€' ? 'EUR' : rawCurr === '£' ? 'GBP' : rawCurr === '$' ? undefined : rawCurr;
     str = str.replace(startMatch[0], '');
  } else if (endMatch) {
     const rawCurr = endMatch[1].toUpperCase();
     currency = rawCurr === '€' ? 'EUR' : rawCurr === '£' ? 'GBP' : rawCurr === '$' ? undefined : rawCurr;
     str = str.replace(endMatch[0], '');
  }

  if (/(€|\$|£|EUR|USD|GBP)/i.test(str)) {
    return { valid: false, value: null, warning: "Multiple or embedded currencies detected", explicitSign };
  }

  str = str.replace(/\s+/g, '');
  if (str === "") return { valid: false, value: null, warning: "Empty amount string" };

  // Remove the ambiguous 3-decimal checks since they break crypto/fractional amounts
  // like 0.123 or 1.234

  // Match EU formatting: e.g. 1.234,56 or 1234,56 or 1,56 (comma is decimal separator)
  // We allow multiple dots for thousands separator, but only one comma for decimal.
  const isEU = /^[-+]?(?:\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)$/.test(str) && str.includes(',');
  
  // Match US formatting: e.g. 1,234.56 or 1234.56 or 1.56 (dot is decimal separator)
  const isUS = /^[-+]?(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/.test(str) && str.includes('.');

  // If it has neither comma nor dot, it's just an integer
  const isInt = /^[-+]?\d+$/.test(str);

  if (!isEU && !isUS && !isInt) {
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

  return { valid: true, value: num, currency, explicitSign };
}
