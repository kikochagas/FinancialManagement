import { describe, it, expect } from "vitest";
import { evaluateMappingConfidence } from "../../bank-import/confidence";
import { ColumnMapping } from "../../bank-import/types";

describe("confidence", () => {
  it("approves a confident deterministic mapping", () => {
    const mapping: Record<number, ColumnMapping> = {
      0: { columnIndex: 0, header: "Data Movimento", semantic: "BOOKING_DATE", confidence: 1.0, source: "deterministic" },
      1: { columnIndex: 1, header: "Descrição", semantic: "DESCRIPTION", confidence: 1.0, source: "deterministic" },
      2: { columnIndex: 2, header: "Valor", semantic: "AMOUNT", confidence: 0.9, source: "deterministic" },
    };

    const res = evaluateMappingConfidence(mapping);
    expect(res.needsAI).toBe(false);
  });

  it("requires AI if missing required fields", () => {
    const mapping: Record<number, ColumnMapping> = {
      0: { columnIndex: 0, header: "Data Movimento", semantic: "BOOKING_DATE", confidence: 1.0, source: "deterministic" },
      1: { columnIndex: 1, header: "Descrição", semantic: "DESCRIPTION", confidence: 1.0, source: "deterministic" },
      // AMOUNT missing
    };

    const res = evaluateMappingConfidence(mapping);
    expect(res.needsAI).toBe(true);
    expect(res.reason).toContain("Missing AMOUNT");
  });

  it("approves debit/credit combination without amount", () => {
    const mapping: Record<number, ColumnMapping> = {
      0: { columnIndex: 0, header: "Data", semantic: "BOOKING_DATE", confidence: 1.0, source: "deterministic" },
      1: { columnIndex: 1, header: "Desc", semantic: "DESCRIPTION", confidence: 1.0, source: "deterministic" },
      2: { columnIndex: 2, header: "Debito", semantic: "DEBIT", confidence: 1.0, source: "deterministic" },
      3: { columnIndex: 3, header: "Credito", semantic: "CREDIT", confidence: 1.0, source: "deterministic" },
    };

    const res = evaluateMappingConfidence(mapping);
    expect(res.needsAI).toBe(false);
  });

  it("requires AI on semantic collision", () => {
    const mapping: Record<number, ColumnMapping> = {
      0: { columnIndex: 0, header: "Data1", semantic: "BOOKING_DATE", confidence: 1.0, source: "deterministic" },
      1: { columnIndex: 1, header: "Data2", semantic: "BOOKING_DATE", confidence: 1.0, source: "deterministic" }, // collision
      2: { columnIndex: 2, header: "Desc", semantic: "DESCRIPTION", confidence: 1.0, source: "deterministic" },
      3: { columnIndex: 3, header: "Valor", semantic: "AMOUNT", confidence: 1.0, source: "deterministic" },
    };

    const res = evaluateMappingConfidence(mapping);
    expect(res.needsAI).toBe(true);
    expect(res.reason).toContain("Collision");
  });
});
