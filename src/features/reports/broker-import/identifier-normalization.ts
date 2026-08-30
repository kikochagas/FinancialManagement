/**
 * Validates an ISIN (International Securities Identification Number) using the standard checksum.
 * Format: 2-letter country code, 9 alphanumeric characters, 1 check digit.
 */
export function isValidISIN(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
    return false;
  }

  const payload = isin.substring(0, 11);
  const checkDigit = parseInt(isin.charAt(11), 10);

  // Convert payload characters to digits (A=10, B=11, etc.)
  let digits = "";
  for (let i = 0; i < payload.length; i++) {
    const charCode = payload.charCodeAt(i);
    if (charCode >= 65 && charCode <= 90) {
      digits += (charCode - 55).toString();
    } else {
      digits += payload.charAt(i);
    }
  }

  // Double every second digit from the right
  let sum = 0;
  let multiply = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (multiply) {
      digit *= 2;
      // If product >= 10, add its digits
      if (digit > 9) {
        digit = digit - 9; // Equivalent to Math.floor(digit / 10) + (digit % 10) for values 10-18
      }
    }
    sum += digit;
    multiply = !multiply;
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

export function normalizeIdentifier(
  rawIdentifier: string | null,
  explicitISIN: string | null,
  explicitTicker: string | null
): {
  instrumentIdentifier: string | null;
  isin: string | null;
  ticker: string | null;
} {
  let isin: string | null = explicitISIN ? explicitISIN.trim().toUpperCase() : null;
  let ticker: string | null = explicitTicker ? explicitTicker.trim().toUpperCase() : null;
  let instrumentIdentifier: string | null = rawIdentifier ? rawIdentifier.trim() : null;

  if (isin && !isValidISIN(isin)) {
    isin = null; // Ignore invalid ISIN
  }

  // Attempt to infer from general identifier if specific ones aren't mapped
  if (instrumentIdentifier && (!isin || !ticker)) {
    const identUpper = instrumentIdentifier.toUpperCase();
    if (!isin && isValidISIN(identUpper)) {
      isin = identUpper;
    } else if (!ticker && !isValidISIN(identUpper)) {
      ticker = identUpper;
    }
  }

  return { instrumentIdentifier, isin, ticker };
}
