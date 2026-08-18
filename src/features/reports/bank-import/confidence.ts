import { BankColumnSemantic, ColumnMapping } from "./types";

export interface OrchestratedConfidence {
  mapping: Record<number, ColumnMapping>;
  needsAI: boolean;
  reason?: string;
}

/**
 * Evaluates the deterministic mapping and decides if AI fallback is required.
 * 
 * Rules for requiring AI:
 * - Missing required fields: BOOKING_DATE + DESCRIPTION + (AMOUNT OR DEBIT/CREDIT)
 * - Required field confidence < 0.8
 * - Multiple columns mapped to the same semantic
 */
export function evaluateMappingConfidence(
  mapping: Record<number, ColumnMapping>
): OrchestratedConfidence {
  let needsAI = false;
  let reason = "";

  const semanticCounts: Record<string, number> = {};
  const semanticsPresent = new Set<BankColumnSemantic>();

  Object.values(mapping).forEach(col => {
    if (col.semantic) {
      semanticCounts[col.semantic] = (semanticCounts[col.semantic] || 0) + 1;
      semanticsPresent.add(col.semantic);

      if (col.confidence < 0.8 && ["BOOKING_DATE", "DESCRIPTION", "AMOUNT", "DEBIT", "CREDIT"].includes(col.semantic)) {
        needsAI = true;
        reason = `Required field ${col.semantic} has low confidence (${col.confidence}).`;
      }
    }
  });

  // Check for semantic collisions
  for (const [semantic, count] of Object.entries(semanticCounts)) {
    if (count > 1 && semantic !== "IGNORE") {
      needsAI = true;
      reason = `Collision: Multiple columns mapped to ${semantic}.`;
      break;
    }
  }

  // Check required fields
  const hasDate = semanticsPresent.has("BOOKING_DATE");
  const hasDesc = semanticsPresent.has("DESCRIPTION");
  const hasAmount = semanticsPresent.has("AMOUNT");
  const hasDebitCredit = semanticsPresent.has("DEBIT") || semanticsPresent.has("CREDIT");

  if (!hasDate) {
    needsAI = true;
    reason = reason || "Missing BOOKING_DATE.";
  }
  if (!hasDesc) {
    needsAI = true;
    reason = reason || "Missing DESCRIPTION.";
  }
  if (!hasAmount && !hasDebitCredit) {
    needsAI = true;
    reason = reason || "Missing AMOUNT or DEBIT/CREDIT.";
  }

  return { mapping, needsAI, reason };
}
