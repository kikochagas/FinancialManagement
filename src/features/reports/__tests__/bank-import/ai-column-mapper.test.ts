import { describe, it, expect, vi } from "vitest";
import { BankStatementAIMapper } from "../../bank-import/ai-column-mapper";
import { AISanitizedColumnInfo } from "../../bank-import/types";
import { AIProvider } from "../../../../lib/ai/provider";
import { sampleColumnShapes } from "../../bank-import/shape-inference";
import { normalizeHeader } from "../../bank-import/workbook";

describe("ai-column-mapper (Sanitization Boundary)", () => {
  it("does not send sensitive data to the AI provider", async () => {
    // We create a mock AI Provider to intercept the request and inspect what is sent.
    const mockProvider: AIProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        mappings: [],
        overallConfidence: 1.0,
        warnings: []
      })
    };

    const mapper = new BankStatementAIMapper(mockProvider);

    // Synthetic raw spreadsheet rows containing sensitive data
    const rawHeaders = ["Descritivo", "Valor", "Data", "Conta"];
    const rawRows = [
      rawHeaders,
      ["Transfer from John Example", "100.00", "2026-08-16", "PT50000000000000000000000"],
      ["Payroll 123456789", "5000.00", "2026-08-15", "PT50000000000000000000123"]
    ];

    // Simulate parser orchestration path
    const sanitizedInput: AISanitizedColumnInfo[] = rawHeaders.map((header, idx) => ({
      index: idx,
      normalizedHeader: normalizeHeader(header),
      valueShapes: sampleColumnShapes(rawRows.slice(1), idx)
    }));

    await mapper.mapColumns(sanitizedInput);

    const callArgs = (mockProvider.generateStructured as any).mock.calls[0][0];
    const userPrompt = callArgs.userPrompt;

    // Ensure NO real sensitive data is inside the prompt.
    expect(userPrompt).not.toContain("John Example");
    expect(userPrompt).not.toContain("PT50000000000000000000000");
    expect(userPrompt).not.toContain("123456789");

    // Ensure it ONLY contains shapes
    expect(userPrompt).toContain("DATE_ISO");
    expect(userPrompt).toContain("IBAN");
    expect(userPrompt).toContain("SHORT_TEXT");
  });
});
