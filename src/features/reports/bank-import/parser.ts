import { BankColumnSemantic, ColumnMapping } from "./types";
import { getDeterministicSemantic } from "./column-mapping";
import { evaluateMappingConfidence } from "./confidence";
import { BankStatementAIMapper } from "./ai-column-mapper";
import { AISanitizedColumnInfo } from "./types";
import { normalizeHeader } from "./workbook";
import { sampleColumnShapes } from "./shape-inference";

export async function orchestrateColumnMapping(
  headers: string[],
  dataRows: any[][],
  aiMapper: BankStatementAIMapper,
  headerRowIndex: number = 0
): Promise<{ mapping: Record<number, ColumnMapping>; aiSucceeded: boolean; aiAttempted: boolean; aiError: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const mapping: Record<number, ColumnMapping> = {};

  // 1. Deterministic Pass
  headers.forEach((header, index) => {
    const sem = getDeterministicSemantic(normalizeHeader(header));
    mapping[index] = {
      columnIndex: index,
      header,
      semantic: sem ? sem.semantic : null,
      confidence: sem ? sem.confidence : 0,
      source: "deterministic",
    };
  });

  // Collision handling for DESCRIPTION
  const descColumns = Object.values(mapping).filter(m => m.semantic === "DESCRIPTION");
  if (descColumns.length > 1) {
    descColumns.forEach(m => {
      mapping[m.columnIndex].confidence = 0.4; // Degrade confidence to force review
      warnings.push(`Semantic collision on DESCRIPTION for column: ${m.header}`);
    });
  }

  const evalResult = evaluateMappingConfidence(mapping);

  let aiAttempted = false;
  let aiSucceeded = false;
  let aiError: string | null = null;

  if (evalResult.needsAI) {
    aiAttempted = true;
    let aiResult: any = null;

    try {
      const transactionDataRows = dataRows.slice(headerRowIndex + 1);
      const sanitizedCols: AISanitizedColumnInfo[] = headers.map((header, idx) => ({
        index: idx,
        normalizedHeader: normalizeHeader(header),
        valueShapes: sampleColumnShapes(transactionDataRows, idx),
      }));

      aiResult = await aiMapper.mapColumns(sanitizedCols);
    } catch (e: any) {
      aiError = e.message || "AI_MAPPING_UNAVAILABLE";
    }

    if (aiResult) {
      try {
        if (!aiResult.mappings || !Array.isArray(aiResult.mappings)) {
            throw new Error("Invalid mappings returned from AI");
        }

        aiResult.mappings.forEach((aiMapping: any) => {
          const existing = mapping[aiMapping.columnIndex];
          if (existing) {
            if (existing.confidence < 0.8 || !existing.semantic) {
              mapping[aiMapping.columnIndex] = {
                columnIndex: aiMapping.columnIndex,
                header: aiMapping.header,
                semantic: aiMapping.semantic === "IGNORE" ? null : aiMapping.semantic,
                confidence: aiMapping.confidence,
                source: "ai",
              };
            } else if (existing.semantic !== aiMapping.semantic) {
              mapping[aiMapping.columnIndex].confidence = 0.5; // Flagged
              warnings.push(`AI disagreed with strong deterministic match for column: ${existing.header}`);
            }
          }
        });

        const aiWarnings = Array.isArray(aiResult.warnings) ? aiResult.warnings : [];
        warnings.push(...aiWarnings);

        // Explicit invariant: If we get here successfully, it succeeded.
        aiSucceeded = true;
        aiError = null;
      } catch (e: any) {
        warnings.push(`Local AI merge failed: ${e.message}`);
        aiSucceeded = false;
        // Do not set aiError here, as the AI itself didn't fail availability, just post-processing.
      }
    }
  }

  return { mapping, aiAttempted, aiSucceeded, aiError, warnings };
}
