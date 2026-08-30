import { ColumnMapping } from "./types";

export function getProvenanceLabel(source: string | undefined | null, confidence: number, semantic?: string | null): string {
  if (!semantic || semantic === "UNMAPPED") return "Not mapped";
  if (source === "user") return "Selected by you";
  if (source === "ai") return `AI-assisted · ${(confidence * 100).toFixed(0)}%`;
  if (source === "deterministic") return `Automatic · ${(confidence * 100).toFixed(0)}%`;
  return "Not mapped";
}

export function validateMappings(mapping: Record<number, ColumnMapping>) {
  const assignedSemantics = Object.values(mapping)
    .map(m => m.semantic)
    .filter(s => s && s !== "IGNORE" && s !== "UNMAPPED");

  const hasDate = assignedSemantics.includes("DATE") || assignedSemantics.includes("DATETIME");
  const hasEvent = assignedSemantics.includes("EVENT_TYPE");
  const missingRequired = !hasDate || !hasEvent;

  const semanticCounts: Record<string, number> = {};
  for (const sem of assignedSemantics) {
    if (sem) semanticCounts[sem as string] = (semanticCounts[sem as string] || 0) + 1;
  }
  
  const duplicates = Object.entries(semanticCounts)
    .filter(([_, count]) => count > 1)
    .map(([sem]) => sem);

  return {
    isValid: !missingRequired && duplicates.length === 0,
    missingRequired,
    duplicates
  };
}

export function getFriendlyActivityLabel(eventType: string | null | undefined, rawEventType: string | null | undefined): string {
  const map: Record<string, string> = {
    "BUY": "Buy",
    "SELL": "Sell",
    "DIVIDEND": "Dividend",
    "INTEREST": "Interest", 
    "CASH_DEPOSIT": "Cash deposit",
    "CASH_WITHDRAWAL": "Cash withdrawal", 
    "ASSET_TRANSFER_IN": "Asset received",
    "ASSET_TRANSFER_OUT": "Asset transferred out", 
    "FEE": "Fee",
    "TAX": "Tax",
    "CORPORATE_ACTION": "Corporate action",
    "OTHER": "Other",
    "IGNORE": "Ignore"
  };
  return (eventType && map[eventType]) || rawEventType || "";
}
