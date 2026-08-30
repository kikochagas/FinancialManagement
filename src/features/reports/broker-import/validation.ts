import { ParsedBrokerTransaction } from "./types";

export function validateBrokerTransaction(tx: ParsedBrokerTransaction): void {
  tx.valid = true;
  if (!tx.warnings) tx.warnings = [];

  if (!tx.occurredAt) {
    tx.valid = false;
    tx.warnings.push("Missing occurred date/time.");
  }

  if (!tx.eventType) {
    tx.valid = false;
    tx.warnings.push("Missing event type.");
  }

  if (tx.eventType === "BUY" || tx.eventType === "SELL") {
    if (!tx.instrumentIdentifier && !tx.isin && !tx.ticker && !tx.instrumentName) {
      tx.valid = false;
      tx.warnings.push("Missing instrument identifier for trade.");
    }
    if (tx.quantity === null) {
      tx.valid = false;
      tx.warnings.push("Missing quantity for trade.");
    }
    if (tx.unitPrice === null && tx.amount === null) {
      tx.valid = false;
      tx.warnings.push("Trade must have at least a unit price or an amount.");
    }
  }

  if (tx.eventType === "DIVIDEND" || tx.eventType === "INTEREST" || tx.eventType === "CASH_DEPOSIT" || tx.eventType === "CASH_WITHDRAWAL" || tx.eventType === "FEE" || tx.eventType === "TAX") {
    if (tx.amount === null) {
      tx.valid = false;
      tx.warnings.push("Missing amount for cash movement.");
    }
  }

  if (tx.eventType === "CORPORATE_ACTION") {
    if (tx.quantity === null && tx.amount === null) {
      tx.warnings.push("Corporate action has neither quantity nor amount.");
    }
  }
}
