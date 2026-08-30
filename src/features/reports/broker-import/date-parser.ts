import { ParseResult } from "./types";

/**
 * Deterministic date/datetime parser for broker imports.
 * Supports preserving ISO timestamps (DATETIME).
 */
export function parseBrokerDatetimeStrict(input: any): ParseResult<string> {
  if (input === null || input === undefined || input === "") {
    return { valid: false, value: null, warning: "Missing date" };
  }

  if (typeof input === "number") {
    const unixTimestamp = (input - 25569) * 86400 * 1000;
    const date = new Date(unixTimestamp);
    if (!isNaN(date.getTime())) {
      return { valid: true, value: date.toISOString() };
    }
  }

  const str = String(input).trim();

  // Try ISO datetime string e.g., "2024-01-01T12:00:00Z" or "2024-01-01T12:00:00"
  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  const isoMatch = str.match(isoRegex);
  
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const h = parseInt(isoMatch[4], 10);
    const min = parseInt(isoMatch[5], 10);
    const s = parseInt(isoMatch[6], 10);
    const tz = isoMatch[7]; // Can be undefined

    // Reject out of bounds (strict calendar logic)
    if (m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || s > 59) {
       return { valid: false, value: null, warning: `Invalid ISO datetime (out of bounds): ${str}` };
    }
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > daysInMonth) {
       return { valid: false, value: null, warning: `Invalid ISO datetime (invalid day for month): ${str}` };
    }

    // Determine deterministic timestamp
    let dateObj: Date;
    if (tz) {
       // It has an explicit timezone, safely rely on Date to parse the offset
       dateObj = new Date(str);
    } else {
       // Timezone-less ISO datetime, treat as UTC deterministically
       dateObj = new Date(Date.UTC(y, m - 1, d, h, min, s));
    }

    if (isNaN(dateObj.getTime())) {
       return { valid: false, value: null, warning: `Invalid ISO datetime: ${str}` };
    }
    return { valid: true, value: dateObj.toISOString() };
  }

  // Try YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    
    if (m < 1 || m > 12 || d < 1) return { valid: false, value: null, warning: `Invalid calendar date: ${str}` };
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > daysInMonth) return { valid: false, value: null, warning: `Invalid calendar date (day): ${str}` };

    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return { valid: true, value: dateObj.toISOString() };
  }

  // Try YYYY-MM-DD HH:mm:ss
  const ymdhmsMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (ymdhmsMatch) {
    const isoStr = str.replace(/\s+/, 'T'); // No 'Z' added, recursive fallthrough to isoMatch equivalent
    return parseBrokerDatetimeStrict(isoStr);
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    if (month < 1 || month > 12 || day < 1) return { valid: false, value: null, warning: `Invalid calendar date: ${str}` };
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return { valid: false, value: null, warning: `Invalid calendar date (day): ${str}` };

    const dateObj = new Date(Date.UTC(year, month - 1, day));
    return { valid: true, value: dateObj.toISOString() };
  }

  return { valid: false, value: null, warning: `Invalid date format: ${str}` };
}
