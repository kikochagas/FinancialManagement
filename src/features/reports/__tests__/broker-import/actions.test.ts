import { expect, test, describe, vi } from "vitest";
import { generateDedupKey } from "../../broker-import/dedup";
import { validateBrokerTransaction } from "../../broker-import/validation";
import { evaluateBrokerMappingConfidence } from "../../broker-import/confidence";
import { mapBrokerColumnsDeterministically } from "../../broker-import/column-mapping";
import { orchestrateBrokerColumnMapping } from "../../broker-import/orchestrator";

describe("broker-import deduplication", () => {
  test("external_id is respected and preferred", () => {
    const key1 = generateDedupKey("acc1", { externalId: "EXT-123", occurredAt: "2024-01-01" } as any);
    const key2 = generateDedupKey("acc1", { externalId: "EXT-123", amount: 100, occurredAt: "2024-01-01" } as any);
    expect(key1).toBe(key2);
  });

  test("fallback dedup uses instrument identity", () => {
    const tx1 = {
      occurredAt: "2024-01-01T12:00:00Z",
      eventType: "BUY",
      isin: "US8740541094",
      quantity: 10,
      amount: -1500,
      currency: "EUR",
      sourceRow: 10
    };
    const tx2 = { ...tx1, sourceRow: 50 }; // Same but different row
    const tx3 = { ...tx1, ticker: "AAPL", isin: null }; // Different identity

    expect(generateDedupKey("acc1", tx1 as any)).toBe(generateDedupKey("acc1", tx2 as any));
    expect(generateDedupKey("acc1", tx1 as any)).not.toBe(generateDedupKey("acc1", tx3 as any));
  });
});

describe("broker-import validation (server/client)", () => {
  test("BUY missing instrument rejected", () => {
    const tx = { eventType: "BUY", occurredAt: "2024-01-01", quantity: 1, amount: 100, warnings: [], valid: true };
    validateBrokerTransaction(tx as any);
    expect(tx.valid).toBe(false);
  });
  test("BUY missing amount and unitPrice rejected", () => {
    const tx = { eventType: "BUY", occurredAt: "2024-01-01", isin: "US123", quantity: 1, amount: null, unitPrice: null, warnings: [], valid: true };
    validateBrokerTransaction(tx as any);
    expect(tx.valid).toBe(false);
  });
  test("preserves prior warnings", () => {
    const tx = { eventType: "BUY", occurredAt: "2024-01-01", isin: "US123", quantity: 1, amount: 100, unitPrice: null, warnings: ["Existing warning"], valid: true };
    validateBrokerTransaction(tx as any);
    expect(tx.valid).toBe(true);
    expect(tx.warnings).toContain("Existing warning");
  });
});

describe("broker-import mapping and AI orchestration", () => {
  test("all headers receive a deterministic mapping entry, even unknown ones", () => {
    const headers = ["Date", "Type", "WeirdUnknownColumn"];
    const normalized = ["date", "type", "weirdunknowncolumn"];
    const mapping = mapBrokerColumnsDeterministically(headers, normalized);
    
    expect(mapping[0].semantic).toBe("DATE");
    expect(mapping[1].semantic).toBe("EVENT_TYPE");
    expect(mapping[2]).toBeDefined();
    expect(mapping[2].semantic).toBe(null); // Explicitly present but unmapped
  });

  test("order_id is NOT treated automatically as external ID", () => {
    const mapping = mapBrokerColumnsDeterministically(["order_id"], ["order_id"]);
    expect(mapping[0].semantic).toBeNull();
  });
  test("transaction_id is treated as external ID", () => {
    const mapping = mapBrokerColumnsDeterministically(["transaction_id"], ["transaction_id"]);
    expect(mapping[0].semantic).toBe("EXTERNAL_ID");
  });

  test("confidence evaluates duplicates and missing fields correctly", () => {
    const missingBoth = {
      0: { semantic: "AMOUNT", confidence: 1 } as any
    };
    expect(evaluateBrokerMappingConfidence(missingBoth)).toBeLessThan(0.8);

    const duplicates = {
      0: { semantic: "DATE", confidence: 1 } as any,
      1: { semantic: "EVENT_TYPE", confidence: 1 } as any,
      2: { semantic: "AMOUNT", confidence: 1 } as any,
      3: { semantic: "AMOUNT", confidence: 1 } as any,
    };
    expect(evaluateBrokerMappingConfidence(duplicates)).toBeLessThan(0.8);
  });

  test("orchestrator uses AI fallback safely without sending raw rows", async () => {
    const headers = ["Date", "Type", "Val", "Desc"];
    const normalized = ["date", "type", "val", "desc"];
    const rows = [headers, ["2024-01-01", "BUY", "100", "test"]];
    
    const mockAi = {
      mapColumns: vi.fn().mockResolvedValue({
        mappings: [
          { columnIndex: 2, semantic: "AMOUNT", confidence: 0.9 },
          { columnIndex: 3, semantic: "DESCRIPTION", confidence: 0.8 },
        ],
        warnings: []
      })
    };

    const result = await orchestrateBrokerColumnMapping(headers, normalized, rows, 0, mockAi);
    expect(result.aiAttempted).toBe(true);
    expect(result.aiSucceeded).toBe(true);
    expect(result.mapping[2].semantic).toBe("AMOUNT");
    expect(result.mapping[3].semantic).toBe("DESCRIPTION");
    
    // Check that AI only received sanitized data, not raw rows
    const callArgs = mockAi.mapColumns.mock.calls[0][0];
    expect(callArgs[0]).not.toHaveProperty("rawRow");
    expect(callArgs.some((c: any) => c.valueShapes.length > 0)).toBe(true); // Should just be shapes
  });

  test("orchestrator does not overwrite strong deterministic mappings", async () => {
    const headers = ["Amount", "Desc"];
    const normalized = ["amount", "desc"];
    const rows = [headers, ["100", "test"]];
    
    const mockAi = {
      mapColumns: vi.fn().mockResolvedValue({
        mappings: [
          { columnIndex: 0, semantic: "FEE", confidence: 0.95 }, // AI wants FEE
        ],
        warnings: []
      })
    };

    const result = await orchestrateBrokerColumnMapping(headers, normalized, rows, 0, mockAi);
    // Deterministic maps "amount" to AMOUNT with confidence 1.0
    expect(result.mapping[0].semantic).toBe("AMOUNT");
    expect(result.mapping[0].source).toBe("deterministic");
    expect(result.warnings.length).toBeGreaterThan(0); // Emits a warning about discrepancy
  });

  test("order_id remains unmapped even if AI somehow suggests EXTERNAL_ID", async () => {
    const headers = ["order_id"];
    const normalized = ["order_id"];
    const rows = [headers, ["ORD123"]];
    
    const mockAi = {
      mapColumns: vi.fn().mockResolvedValue({
        mappings: [
          { columnIndex: 0, semantic: "EXTERNAL_ID", confidence: 0.95 },
        ],
        warnings: []
      })
    };

    // First ensure deterministic does not map it
    const deterministic = mapBrokerColumnsDeterministically(headers, normalized);
    expect(deterministic[0].semantic).toBeNull();

    const result = await orchestrateBrokerColumnMapping(headers, normalized, rows, 0, mockAi);
    expect(result.mapping[0].semantic).toBeNull();
    expect(result.warnings.some(w => w.includes("disabled for safety"))).toBe(true);
  });
});
