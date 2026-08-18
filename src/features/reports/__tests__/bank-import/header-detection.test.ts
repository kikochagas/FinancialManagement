import { describe, it, expect } from "vitest";
import { detectHeaderRow } from "../../bank-import/header-detection";
import { getDeterministicSemantic } from "../../bank-import/column-mapping";
import { normalizeHeader } from "../../bank-import/workbook";

describe("header-detection", () => {
  it("detects standard portuguese header row", () => {
    const rows = [
      ["Metadata info here", "", ""],
      ["Bank Report", "Date: 2026", ""],
      [],
      ["Data Movimento", "Data Valor", "Descrição", "Valor", "Saldo Após Movimento", "Tipo"]
    ];

    const result = detectHeaderRow(rows);
    expect(result.headerRowIndex).toBe(3);
    expect(result.score).toBeGreaterThan(3);
  });

  it("returns null when no credible header is found", () => {
    const rows = [
      ["Hello", "World"],
      [123, 456],
      ["Random", "Data", "Here"]
    ];

    const result = detectHeaderRow(rows);
    expect(result.headerRowIndex).toBeNull();
  });
});

describe("column-mapping", () => {
  it("normalizes headers correctly", () => {
    expect(normalizeHeader("Data Movimento")).toBe("data movimento");
    expect(normalizeHeader("Descrição")).toBe("descricao");
    expect(normalizeHeader("Saldo após movimento")).toBe("saldo apos movimento");
    expect(normalizeHeader("  Valor (€) ")).toBe("valor"); // punctuation removed
  });

  it("maps exact aliases with high confidence", () => {
    const res = getDeterministicSemantic("data movimento");
    expect(res).toEqual({ semantic: "BOOKING_DATE", confidence: 1.0 });

    const res2 = getDeterministicSemantic("descricao");
    expect(res2).toEqual({ semantic: "DESCRIPTION", confidence: 1.0 });
  });

  it("maps partial matches with degraded confidence", () => {
    // Dictionary has "data valor" mapping to VALUE_DATE and "data" mapping to BOOKING_DATE (0.8).
    const res = getDeterministicSemantic("data");
    expect(res).toEqual({ semantic: "BOOKING_DATE", confidence: 0.8 });
    
    // "montante" -> AMOUNT 1.0
    // "montante eur" -> partial match on "montante" -> 0.8
    const res3 = getDeterministicSemantic("montante eur");
    expect(res3).toEqual({ semantic: "AMOUNT", confidence: 0.8 });
  });
});
