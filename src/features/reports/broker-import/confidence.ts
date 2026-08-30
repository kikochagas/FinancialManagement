import { ColumnMapping } from "./types";

export function evaluateBrokerMappingConfidence(mapping: Record<number, ColumnMapping>): number {
  const mappedSemantics = Object.values(mapping).map(m => m.semantic);
  
  let score = 1.0;
  
  // Need either DATETIME or DATE
  if (!mappedSemantics.includes("DATETIME") && !mappedSemantics.includes("DATE")) {
    score -= 0.4;
  }
  
  // Need EVENT_TYPE
  if (!mappedSemantics.includes("EVENT_TYPE")) {
    score -= 0.4;
  }
  
  // Need AMOUNT or QUANTITY
  if (!mappedSemantics.includes("AMOUNT") && !mappedSemantics.includes("QUANTITY")) {
    score -= 0.3;
  }

  // Detect duplicates
  const nonNull = mappedSemantics.filter(s => s && s !== "IGNORE" && s !== "UNMAPPED");
  const unique = new Set(nonNull);
  if (unique.size !== nonNull.length) {
    score -= 0.5;
  }

  // Detect low confidence
  const hasLowConfidenceRequired = Object.values(mapping).some(
    m => (m.semantic === "DATETIME" || m.semantic === "DATE" || m.semantic === "EVENT_TYPE") && m.confidence < 0.6
  );
  if (hasLowConfidenceRequired) {
    score -= 0.2;
  }
  
  return Math.max(0, score);
}
