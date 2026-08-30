export function detectHeaderRow(rows: any[][]): number | null {
  if (!rows || rows.length === 0) return null;
  
  let bestRow = -1;
  let maxScore = -1;

  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row) continue;
    
    let stringCols = 0;
    let emptyCols = 0;
    
    for (const cell of row) {
      if (cell === undefined || cell === null || cell === "") {
        emptyCols++;
      } else if (typeof cell === "string" && isNaN(Number(cell))) {
        stringCols++;
      }
    }
    
    // Heuristic: A header row typically has many strings and few empties
    const score = stringCols - (emptyCols * 0.5);
    
    if (score > maxScore && stringCols > 1) {
      maxScore = score;
      bestRow = i;
    }
  }

  return bestRow >= 0 ? bestRow : null;
}

export function normalizeHeader(header: string): string {
  if (!header) return "";
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "_")            // Replace whitespace with _
    .replace(/[^\w]/g, "")           // Remove non-word chars
    .trim();
}
