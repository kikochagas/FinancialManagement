import { normalizeHeader } from "./workbook";
import { BankColumnSemantic } from "./types";
import { getDeterministicSemantic } from "./column-mapping";

const HEADER_SEARCH_WINDOW = 50;

/**
 * Identifies the most likely header row in a 2D array.
 * Looks at the first 50 rows.
 * Scores rows based on known semantic vocabulary.
 */
export function detectHeaderRow(rows: any[][]): { headerRowIndex: number | null, score: number } {
  let bestRow = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_WINDOW); i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let score = 0;
    
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      
      const normalized = normalizeHeader(cell);
      if (!normalized) continue;
      
      const semanticInfo = getDeterministicSemantic(normalized);
      if (semanticInfo && semanticInfo.semantic) {
        score += semanticInfo.confidence;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  // Threshold: Needs at least some strong indicators (e.g. date + amount or date + description)
  // Let's say a score of >= 1.5 is a plausible header.
  if (bestScore >= 1.5) {
    return { headerRowIndex: bestRow, score: bestScore };
  }

  return { headerRowIndex: null, score: 0 };
}
