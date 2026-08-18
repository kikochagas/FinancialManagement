import { ParseResult } from "./types";

/**
 * Deterministic date parser.
 * Supports:
 * - DD/MM/YYYY
 * - YYYY-MM-DD
 * - Excel serial dates
 * - ISO strings
 * 
 * Will return valid: false with a warning instead of today's date on failure.
 */
export function parseDateStrict(input: any): ParseResult<string> {
  if (input === null || input === undefined || input === "") {
    return { valid: false, value: null, warning: "Missing date" };
  }

  // Handle Excel serial dates (number of days since Jan 1, 1900)
  if (typeof input === "number") {
    // Excel bug: considers 1900 a leap year. So subtract 1 for dates after Feb 28, 1900.
    // Generally, standard conversion:
    const unixTimestamp = (input - 25569) * 86400 * 1000;
    const date = new Date(unixTimestamp);
    if (!isNaN(date.getTime())) {
      return { valid: true, value: date.toISOString().split('T')[0] };
    }
  }

  const str = String(input).trim();

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.substring(0, 10).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (!isNaN(dateObj.getTime()) && dateObj.getUTCFullYear() === y && dateObj.getUTCMonth() === m - 1 && dateObj.getUTCDate() === d) {
      return { valid: true, value: dateObj.toISOString().split('T')[0] };
    }
    return { valid: false, value: null, warning: `Invalid calendar date: ${str}` };
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/\-]/);
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      let year = parseInt(parts[2].substring(0, 4), 10);
      if (year < 100) year += 2000; // heuristic for YY

      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        // month is 0-indexed in JS Date
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(dateObj.getTime()) && dateObj.getUTCFullYear() === year && dateObj.getUTCMonth() === month - 1 && dateObj.getUTCDate() === day) {
          return { valid: true, value: dateObj.toISOString().split('T')[0] };
        }
        return { valid: false, value: null, warning: `Invalid calendar date: ${str}` };
      }
    }
  }

  // Do not fall back to generic Date(str) because it parses ambiguous formats unsafely
  return { valid: false, value: null, warning: `Invalid date format: ${str}` };
}
