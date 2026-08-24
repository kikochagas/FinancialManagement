import { describe, it, expect, vi } from "vitest";
import { orchestrateColumnMapping } from "../../bank-import/parser";
import { BankStatementAIMapper } from "../../bank-import/ai-column-mapper";
import { buildTransactions } from "../../bank-import/transaction-builder";

describe("Bank Statement Import Orchestration", () => {
  it("handles Crédito Agrícola description collision correctly", async () => {
    // Synthetic CA grid
    const headers = ["Data Movimento", "Data Valor", "Descrição", "Descritivo1", "Descritivo2", "Valor", "Saldo após movimento", "Tipo"];
    const rows = [
      headers,
      ["14/08/2026", "14/08/2026", "TRANSFERENCIA CREDITO", "John Example", "", "128,00 €", "128,00", "Crédito"],
      ["15/08/2026", "15/08/2026", "COMPRA C. DEBITO", "SUPERMERCADO", "LISBOA", "-14,74 €", "113,26", "Débito"],
      ["31/02/2026", "31/02/2026", "INVALID CALENDAR DATE", "", "", "50,00 €", "163,26", "Crédito"],
      ["Extrato gerado em 16/08", "", "", "", "", "", "", ""] // Footer
    ];

    // Mock AI that just fails gracefully or isn't called
    const mockAiMapper = new BankStatementAIMapper({
      generateStructured: async () => {
        throw new Error("AI_MAPPING_UNAVAILABLE");
      }
    });

    const { mapping, warnings } = await orchestrateColumnMapping(headers, rows, mockAiMapper);

    // Verify Collision is detected and confidence lowered
    const descCols = Object.values(mapping).filter(m => m.semantic === "DESCRIPTION");
    expect(descCols.length).toBeGreaterThan(1);
    expect(warnings.some(w => w.includes("Semantic collision on DESCRIPTION"))).toBe(true);

    // User manually resolves it:
    const resolvedMapping = { ...mapping };
    Object.values(resolvedMapping).forEach(m => {
      if (m.header === "Descrição") m.semantic = "DESCRIPTION";
      else if (m.header === "Descritivo1") m.semantic = "REFERENCE";
      else if (m.header === "Descritivo2") m.semantic = "IGNORE";
      else if (m.header === "Data Movimento") m.semantic = "BOOKING_DATE";
      else if (m.header === "Data Valor") m.semantic = "VALUE_DATE";
      else if (m.header === "Valor") m.semantic = "AMOUNT";
      else if (m.header === "Saldo após movimento") m.semantic = "BALANCE_AFTER";
      else if (m.header === "Tipo") m.semantic = "TYPE";
    });

    const { transactions, endingBalance, footerRowsSkipped } = buildTransactions(rows, 0, resolvedMapping as any);
    
    // Valid: 2, Invalid: 1 (bad date), Footer: skipped
    expect(transactions.length).toBe(3);
    
    const validTxs = transactions.filter(t => t.valid);
    expect(validTxs.length).toBe(2);
    
    // First valid tx
    expect(validTxs[0].description).toBe("TRANSFERENCIA CREDITO"); // Not overwritten
    expect(validTxs[0].amount).toBe(128.00);
    expect(validTxs[0].direction).toBe("Credit");
    expect(validTxs[0].bookingDate).toBe("2026-08-14");

    // Second valid tx
    expect(validTxs[1].description).toBe("COMPRA C. DEBITO");
    expect(validTxs[1].amount).toBe(14.74); // Absolute amount
    expect(validTxs[1].direction).toBe("Debit"); // Derived from sign/TYPE
    expect(validTxs[1].bookingDate).toBe("2026-08-15");

    // The invalid date row
    const invalidTx = transactions.find(t => t.description === "INVALID CALENDAR DATE");
    expect(invalidTx).toBeDefined();
    expect(invalidTx?.valid).toBe(false);
    expect(invalidTx?.warnings.some(w => w.includes("Booking Date is required"))).toBe(true);

    expect(footerRowsSkipped).toBe(1); // The footer was completely skipped
    expect(endingBalance).toBe(113.26); // Chronologically newest
  });
});
