import * as XLSX from "xlsx";
import { detectHeaderRow } from "./header-detection";

/**
 * Normalizes headers for matching
 */
export function normalizeHeader(header: string): string {
  if (!header) return "";
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD") // Decompose Unicode
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()€£]/g, "") // Remove punctuation and currency symbols
    .trim();
}

/**
 * Extracts a sheet as a 2D array of strings/numbers
 */
export function getSheetData(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, {
    header: 1, // 2D array
    raw: true,
    defval: "",
  }) as any[][];
}

export function determineBestSheet(wb: XLSX.WorkBook): string | null {
  let bestSheet = null;
  let maxScore = -1;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = getSheetData(ws);
    
    // Quick heuristic: number of rows with more than 3 columns filled
    let score = 0;
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      if (data[i] && data[i].filter((c: any) => c !== "").length >= 3) {
        score++;
      }
    }
    
    if (score > maxScore && score > 0) {
      maxScore = score;
      bestSheet = sheetName;
    }
  }

  return bestSheet || wb.SheetNames[0];
}
