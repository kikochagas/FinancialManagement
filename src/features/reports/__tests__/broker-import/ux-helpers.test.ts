import { describe, expect, test } from "vitest";
import { getProvenanceLabel, validateMappings, getFriendlyActivityLabel } from "../../broker-import/ux-helpers";

describe("broker-import ux-helpers", () => {
  test("getProvenanceLabel handles sources correctly", () => {
    expect(getProvenanceLabel("deterministic", 0.95, "DATE")).toBe("Automatic · 95%");
    expect(getProvenanceLabel("ai", 0.92, "QUANTITY")).toBe("AI-assisted · 92%");
    expect(getProvenanceLabel("user", 1.0, "FEE")).toBe("Selected by you");
    expect(getProvenanceLabel("deterministic", 0.5, "UNMAPPED")).toBe("Not mapped");
    expect(getProvenanceLabel("deterministic", 0.5, null)).toBe("Not mapped");
  });

  test("validateMappings enforces required fields and detects duplicates", () => {
    // Empty mapping
    expect(validateMappings({}).isValid).toBe(false);
    expect(validateMappings({}).missingRequired).toBe(true);

    // Missing EVENT_TYPE
    expect(validateMappings({
      0: { header: "date", columnIndex: 0, confidence: 1, source: "deterministic", semantic: "DATE" }
    }).isValid).toBe(false);

    // Valid
    const valid = validateMappings({
      0: { header: "date", columnIndex: 0, confidence: 1, source: "deterministic", semantic: "DATE" },
      1: { header: "type", columnIndex: 1, confidence: 1, source: "deterministic", semantic: "EVENT_TYPE" }
    });
    expect(valid.isValid).toBe(true);
    expect(valid.missingRequired).toBe(false);
    expect(valid.duplicates.length).toBe(0);

    // Duplicates
    const withDuplicates = validateMappings({
      0: { header: "date", columnIndex: 0, confidence: 1, source: "deterministic", semantic: "DATE" },
      1: { header: "date2", columnIndex: 1, confidence: 1, source: "user", semantic: "DATE" },
      2: { header: "type", columnIndex: 2, confidence: 1, source: "deterministic", semantic: "EVENT_TYPE" }
    });
    expect(withDuplicates.isValid).toBe(false);
    expect(withDuplicates.duplicates).toContain("DATE");
  });

  test("getFriendlyActivityLabel maps correctly", () => {
    expect(getFriendlyActivityLabel("BUY", null)).toBe("Buy");
    expect(getFriendlyActivityLabel("ASSET_TRANSFER_IN", null)).toBe("Asset received");
    expect(getFriendlyActivityLabel(null, "RAW_DEP")).toBe("RAW_DEP");
  });
});
