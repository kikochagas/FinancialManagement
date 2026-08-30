import crypto from "crypto";
import { ParsedBrokerTransaction } from "./types";

export function generateDedupKey(
  accountId: string,
  tx: ParsedBrokerTransaction
): string {
  // If externalId exists, use it as the strongest dedup source
  if (tx.externalId) {
    return crypto.createHash("sha256").update(`${accountId}:ext:${tx.externalId}`).digest("hex");
  }

  // Fallback: deterministic fingerprint of stable fields
  const components = [
    accountId,
    (typeof tx.occurredAt === "object" && tx.occurredAt !== null && "toISOString" in tx.occurredAt ? (tx.occurredAt as any).toISOString() : tx.occurredAt) || "",
    tx.eventType || "",
    tx.isin || tx.ticker || tx.instrumentIdentifier || tx.instrumentName || "",
    (tx.quantity !== null && tx.quantity !== undefined) ? tx.quantity.toString() : "",
    (tx.amount !== null && tx.amount !== undefined) ? tx.amount.toString() : "",
    tx.currency || ""
  ];

  const fingerprint = components.join("|");
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}
