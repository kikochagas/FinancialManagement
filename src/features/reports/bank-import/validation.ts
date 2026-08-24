import { ParsedBankTransaction } from "./types";

/**
 * Validates a normalized transaction to ensure it has all required fields.
 * Required:
 * - bookingDate (valid date)
 * - description (non-empty string)
 * - amount (valid number)
 * - direction (Credit or Debit)
 */
export function validateTransaction(tx: ParsedBankTransaction): ParsedBankTransaction {
  if (!tx.warnings) tx.warnings = [];
  let isValid = true;

  if (!tx.bookingDate) {
    tx.warnings.push("Booking Date is required.");
    isValid = false;
  } else {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(tx.bookingDate)) {
      tx.warnings.push("Invalid date format.");
      isValid = false;
    } else {
      const d = new Date(tx.bookingDate);
      if (isNaN(d.getTime()) || d.toISOString().split('T')[0] !== tx.bookingDate) {
        tx.warnings.push("Invalid calendar date.");
        isValid = false;
      }
    }
  }

  if (!tx.description || tx.description.trim() === "" || tx.description === "Imported Transaction") {
    tx.warnings.push("Description is empty or missing.");
    isValid = false;
  } else {
    tx.description = tx.description.trim();
  }

  if (tx.amount === null || tx.amount === undefined || !isFinite(tx.amount) || tx.amount <= 0) {
    tx.warnings.push("Amount must be a finite positive number.");
    isValid = false;
  }

  if (tx.direction !== "Credit" && tx.direction !== "Debit") {
    tx.warnings.push("Transaction direction must be Credit or Debit.");
    isValid = false;
  }

  if (tx.currencyConflict) {
    if (!tx.warnings.some(w => w.includes("Currency conflict:"))) {
      tx.warnings.push("Currency conflict must be resolved.");
    }
    isValid = false;
  }

  tx.valid = isValid;
  return tx;
}
