import { z } from "zod";
import { AIProvider } from "../../../lib/ai/provider";
import { BankColumnSemantic, AISanitizedColumnInfo } from "./types";

export const BankStatementAIMappingResultSchema = z.object({
  mappings: z.array(
    z.object({
      columnIndex: z.number(),
      header: z.string(),
      semantic: z.enum([
        "BOOKING_DATE",
        "VALUE_DATE",
        "DESCRIPTION",
        "AMOUNT",
        "DEBIT",
        "CREDIT",
        "TYPE",
        "BALANCE_AFTER",
        "CURRENCY",
        "COUNTERPARTY",
        "PAYER",
        "BENEFICIARY",
        "IBAN",
        "REFERENCE",
        "IGNORE",
      ]),
      confidence: z.number(),
    })
  ),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
});

export type BankStatementAIMappingResult = z.infer<typeof BankStatementAIMappingResultSchema>;

export class BankStatementAIMapper {
  constructor(private provider: AIProvider) {}

  async mapColumns(columns: AISanitizedColumnInfo[]): Promise<BankStatementAIMappingResult> {
    const systemPrompt = `You are an expert at mapping unstructured bank statement exports to a strict vocabulary.
You will be provided with a JSON array of columns. Each column has an index, a normalized header, and a list of observed value shapes from the data rows.
Your job is to identify the semantic meaning of each column.

Available semantics:
- BOOKING_DATE: The date the transaction was booked.
- VALUE_DATE: The effective date of the transaction.
- DESCRIPTION: The main text describing the transaction.
- AMOUNT: A unified transaction amount (signed or unsigned).
- DEBIT: Money out.
- CREDIT: Money in.
- TYPE: Indicates the transaction type or sign.
- BALANCE_AFTER: The account balance after the transaction.
- CURRENCY: The currency code.
- COUNTERPARTY / PAYER / BENEFICIARY: The other party involved.
- IBAN: The account identifier.
- REFERENCE: A reference code or transaction ID.
- IGNORE: Unnecessary or blank column.

Assign a confidence score (0.0 to 1.0) to each mapping.
If you are unsure, provide your best guess but lower the confidence.`;

    const userPrompt = JSON.stringify({ columns }, null, 2);

    return this.provider.generateStructured({
      systemPrompt,
      userPrompt,
      schema: BankStatementAIMappingResultSchema,
      schemaName: "BankStatementMapping",
      schemaDescription: "Maps bank statement columns to defined semantics",
    });
  }
}
