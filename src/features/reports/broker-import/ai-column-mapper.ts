import { z } from "zod";
import { AIProvider } from "../../../lib/ai/provider";
import { BrokerColumnSemantic, AISanitizedColumnInfo } from "./types";

export const BrokerStatementAIMappingResultSchema = z.object({
  mappings: z.array(
    z.object({
      columnIndex: z.number(),
      header: z.string(),
      semantic: z.enum([
        "DATETIME",
        "DATE",
        "EVENT_TYPE",
        "SOURCE_CATEGORY",
        "ASSET_CLASS",
        "INSTRUMENT_NAME",
        "INSTRUMENT_IDENTIFIER",
        "ISIN",
        "TICKER",
        "QUANTITY",
        "UNIT_PRICE",
        "AMOUNT",
        "FEE",
        "TAX",
        "CURRENCY",
        "ORIGINAL_AMOUNT",
        "ORIGINAL_CURRENCY",
        "FX_RATE",
        "DESCRIPTION",
        "IGNORE"
      ]),
      confidence: z.number(),
    })
  ),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
});

export type BrokerStatementAIMappingResult = z.infer<typeof BrokerStatementAIMappingResultSchema>;

export class BrokerTransactionAIMapper {
  constructor(private provider: AIProvider) {}

  async mapColumns(columns: AISanitizedColumnInfo[]): Promise<BrokerStatementAIMappingResult> {
    const systemPrompt = `You are an expert at mapping unstructured broker transaction exports to a strict vocabulary.
You will be provided with a JSON array of columns. Each column has an index, a normalized header, and a list of observed value shapes from the data rows.
Your job is to identify the semantic meaning of each column.

Available semantics:
- DATETIME: Full ISO timestamp (preferred over DATE).
- DATE: The date the transaction occurred (fallback).
- EVENT_TYPE: Action or transaction type (e.g., Buy, Sell, Deposit).
- SOURCE_CATEGORY: Additional category information.
- ASSET_CLASS: Class of the asset (e.g., Stock, Crypto).
- INSTRUMENT_NAME: Name of the asset.
- INSTRUMENT_IDENTIFIER: Unspecified identifier.
- ISIN: Standard International Securities Identification Number.
- TICKER: Stock ticker.
- QUANTITY: Number of shares/units.
- UNIT_PRICE: Price per unit.
- AMOUNT: Total transaction value/amount.
- FEE: Transaction fees or commissions.
- TAX: Withholding or other taxes.
- CURRENCY: Main currency.
- ORIGINAL_AMOUNT: The original amount before FX conversion.
- ORIGINAL_CURRENCY: Original currency.
- FX_RATE: Exchange rate.
- DESCRIPTION: Memo or description.
- IGNORE: Unnecessary or blank column.

Assign a confidence score (0.0 to 1.0) to each mapping.`;

    const userPrompt = JSON.stringify({ columns }, null, 2);

    return this.provider.generateStructured({
      systemPrompt,
      userPrompt,
      schema: BrokerStatementAIMappingResultSchema,
      schemaName: "BrokerStatementMapping",
      schemaDescription: "Maps broker statement columns to defined semantics",
    });
  }
}
