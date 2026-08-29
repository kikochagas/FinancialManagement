import { describe, it, expect, vi } from "vitest";
import { orchestrateColumnMapping } from "../../bank-import/parser";
import { BankStatementAIMapper } from "../../bank-import/ai-column-mapper";
import { AIProvider } from "../../../../lib/ai/provider";

describe("parser orchestration", () => {
  it("A. AI not needed (Pure deterministic parsing when confidence is high)", async () => {
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({})
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const headers = ["Date", "Description", "Amount"];
    const dataRows = [headers, ["01-01-2023", "Supermarket", "-10.00"]];

    const { mapping, aiAttempted, aiSucceeded, aiError, warnings } = await orchestrateColumnMapping(headers, dataRows, mapper);

    expect(aiAttempted).toBe(false);
    expect(aiSucceeded).toBe(false);
    expect(aiError).toBeNull();
    
    expect(mapping[0].semantic).toBe("BOOKING_DATE");
    expect(mapping[1].semantic).toBe("DESCRIPTION");
    expect(mapping[2].semantic).toBe("AMOUNT");
    expect(warnings.length).toBe(0);
    
    // Ensure AI provider was not called
    expect(mockProvider.generateStructured).not.toHaveBeenCalled();
    
    expect(!(aiSucceeded === true && aiError !== null)).toBe(true);
  });

  it("B. AI request throws", async () => {
    // Missing fields trigger AI fallback
    const headers = ["Data", "Desc", "Unknown123"];
    const dataRows = [headers, ["01-01-2023", "Market", "-10.00"]];
    
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockRejectedValue(new Error("credit_balance_exhausted"))
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const { aiAttempted, aiSucceeded, aiError } = await orchestrateColumnMapping(headers, dataRows, mapper);

    expect(aiAttempted).toBe(true);
    expect(aiSucceeded).toBe(false);
    expect(aiError).toBe("credit_balance_exhausted");
    
    expect(mockProvider.generateStructured).toHaveBeenCalled();
    
    expect(!(aiSucceeded === true && aiError !== null)).toBe(true);
  });

  it("C. AI succeeds (defensively handles missing warnings)", async () => {
    const headers = ["Data", "Desc", "Unknown123"];
    const dataRows = [headers, ["01-01-2023", "Market", "-10.00"]];
    
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        mappings: [
          { columnIndex: 0, header: "Data", semantic: "BOOKING_DATE", confidence: 0.9 },
          { columnIndex: 1, header: "Desc", semantic: "DESCRIPTION", confidence: 0.9 },
          { columnIndex: 2, header: "Unknown123", semantic: "AMOUNT", confidence: 0.8 },
        ],
        overallConfidence: 0.9,
        // specifically omit 'warnings' array to ensure defensive parsing works without crashing
      })
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const { mapping, aiAttempted, aiSucceeded, aiError, warnings } = await orchestrateColumnMapping(headers, dataRows, mapper);

    expect(aiAttempted).toBe(true);
    expect(aiSucceeded).toBe(true);
    expect(aiError).toBeNull();
    
    expect(mockProvider.generateStructured).toHaveBeenCalled();
    
    // Check that AI mapping was applied
    expect(mapping[2].semantic).toBe("AMOUNT");
    expect(mapping[2].source).toBe("ai");

    // Warnings array should not crash even if omitted from AI
    expect(Array.isArray(warnings)).toBe(true);

    // INVARIANT check
    expect(!(aiSucceeded === true && aiError !== null)).toBe(true);
  });
  
  it("D. Local AI merge fails (Invalid mappings structure)", async () => {
    const headers = ["Data", "Desc", "Unknown123"];
    const dataRows = [headers, ["01-01-2023", "Market", "-10.00"]];
    
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        // Missing 'mappings' array entirely
        overallConfidence: 0.9,
        warnings: []
      })
    };
    const mapper = new BankStatementAIMapper(mockProvider);

    const { aiAttempted, aiSucceeded, aiError, warnings } = await orchestrateColumnMapping(headers, dataRows, mapper);

    expect(aiAttempted).toBe(true);
    // AI request succeeded...
    expect(aiError).toBeNull(); 
    // ...but merge failed
    expect(aiSucceeded).toBe(false);
    expect(warnings.some(w => w.includes("Local AI merge failed"))).toBe(true);
    
    expect(!(aiSucceeded === true && aiError !== null)).toBe(true);
  });
});
