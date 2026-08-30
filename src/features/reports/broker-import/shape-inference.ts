import { ValueShape } from "./types";

export function inferValueShape(value: any): ValueShape {
  if (value === null || value === undefined || value === "") return "EMPTY";
  
  const str = String(value).trim();
  if (str.length === 0) return "EMPTY";

  if (typeof value === "number" && value > 30000 && value < 70000) return "EXCEL_DATE_SERIAL";

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return "DATETIME_ISO";
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(str)) return "DATETIME_ISO";
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return "DATE_ISO";
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(str)) return "DATE_DD_MM_YYYY";

  // ISIN
  if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(str)) return "ISIN_LIKE";

  // Currency
  if (/^(EUR|USD|GBP|CHF|BRL)$/i.test(str)) return "CURRENCY_CODE";

  // Numbers (Simplified check)
  const isNegative = str.includes("-");
  const cleanStr = str.replace(/[€$£\s]/g, "");
  if (/^[-+]?(?:\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)$/.test(cleanStr) || 
      /^[-+]?(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/.test(cleanStr)) {
    return isNegative ? "NEGATIVE_NUMBER" : "POSITIVE_NUMBER";
  }

  // Text
  if (str.length < 30) return "SHORT_TEXT";
  return "LONG_TEXT";
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
