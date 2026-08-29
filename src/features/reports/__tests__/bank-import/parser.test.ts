import { describe, it, expect, vi } from "vitest";
import { orchestrateColumnMapping } from "../../bank-import/parser";
import { BankStatementAIMapper } from "../../bank-import/ai-column-mapper";
import { AIProvider } from "../../../../lib/ai/provider";

describe("parser orchestration", () => {
  it("uses pure deterministic parsing when confidence is high", async () => {
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({})
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const headers = ["Data Movimento", "Descrição", "Valor"];
    const dataRows = [[]]; // not actually used deeply in mock

    const { mapping, aiSucceeded, warnings } = await orchestrateColumnMapping(headers, dataRows, mapper);

    expect(aiSucceeded).toBe(false); // No AI fallback required
    expect(mapping[0].semantic).toBe("BOOKING_DATE");
    expect(mapping[1].semantic).toBe("DESCRIPTION");
    expect(mapping[2].semantic).toBe("AMOUNT");
    expect(warnings.length).toBe(0);
    
    // Ensure AI provider was not called
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
  });

  it("falls back to AI when deterministic confidence is low or required fields are missing", async () => {
    // We provide headers that miss "Valor" to trigger AI fallback
    const headers = ["Data", "Desc", "Unknown123"];
    
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        mappings: [
          { columnIndex: 0, header: "Data", semantic: "BOOKING_DATE", confidence: 0.9 },
          { columnIndex: 1, header: "Desc", semantic: "DESCRIPTION", confidence: 0.9 },
          { columnIndex: 2, header: "Unknown123", semantic: "AMOUNT", confidence: 0.8 },
        ],
        overallConfidence: 0.9,
        warnings: []
      })
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const { mapping, aiSucceeded, warnings } = await orchestrateColumnMapping(headers, [[]], mapper);

    expect(aiSucceeded).toBe(true);
    expect(mockProvider.generateStructured).toHaveBeenCalled();
    
    // Check that AI mapping was applied
    expect(mapping[2].semantic).toBe("AMOUNT");
    expect(mapping[2].source).toBe("ai");
  });
});
