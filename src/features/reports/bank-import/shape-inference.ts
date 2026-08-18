import { ValueShape } from "./types";

export function inferValueShape(value: any): ValueShape {
  if (value === null || value === undefined || value === "") return "EMPTY";
  
  const str = String(value).trim();
  if (str.length === 0) return "EMPTY";

  // Check Excel Date Serial
  if (typeof value === "number" && value > 30000 && value < 70000) return "EXCEL_DATE_SERIAL";

  // Check Dates
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return "DATE_ISO";
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(str)) return "DATE_DD_MM_YYYY";

  // Check IBAN/Account (very loose heuristic for privacy boundaries)
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(str.replace(/\s+/g, ""))) return "IBAN";
  if (/^\d{8,20}$/.test(str.replace(/[\s-]/g, ""))) return "ACCOUNT_IDENTIFIER";

  // Currency
  if (/^(EUR|USD|GBP|CHF|BRL)$/i.test(str)) return "CURRENCY_CODE";

  // Numbers/Amounts
  const amountMatch = str.replace(/\s+/g, "").match(/^([+-]?)(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?(€)?$/);
  if (amountMatch) {
    const isNegative = amountMatch[1] === "-" || str.includes("-");
    const hasEur = !!amountMatch[2] || str.includes("€");
    if (hasEur) return isNegative ? "NEGATIVE_EUR_AMOUNT" : "POSITIVE_EUR_AMOUNT";
    return isNegative ? "NEGATIVE_NUMBER" : "POSITIVE_NUMBER";
  }
  
  const amountMatch2 = str.replace(/\s+/g, "").match(/^([+-]?)(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(€)?$/);
  if (amountMatch2) {
    const isNegative = amountMatch2[1] === "-" || str.includes("-");
    const hasEur = !!amountMatch2[2] || str.includes("€");
    if (hasEur) return isNegative ? "NEGATIVE_EUR_AMOUNT" : "POSITIVE_EUR_AMOUNT";
    return isNegative ? "NEGATIVE_NUMBER" : "POSITIVE_NUMBER";
  }

  // Text
  if (str.length < 30) return "SHORT_TEXT";
  if (str.length >= 30) return "LONG_TEXT";

  return "UNKNOWN_TEXT";
}

export function sampleColumnShapes(rows: any[][], columnIndex: number, maxSamples = 10): ValueShape[] {
  const shapes = new Set<ValueShape>();
  let sampled = 0;
  for (let i = 0; i < rows.length && sampled < maxSamples; i++) {
    const val = rows[i][columnIndex];
    if (val !== undefined && val !== null && val !== "") {
      shapes.add(inferValueShape(val));
      sampled++;
    }
  }
  if (shapes.size === 0) shapes.add("EMPTY");
  return Array.from(shapes);
}
