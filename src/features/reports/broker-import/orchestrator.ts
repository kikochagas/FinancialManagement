import { ColumnMapping, BrokerColumnSemantic } from "./types";
import { mapBrokerColumnsDeterministically } from "./column-mapping";
import { evaluateBrokerMappingConfidence } from "./confidence";
import { sampleColumnShapes } from "./shape-inference";
import { BrokerTransactionAIMapper } from "./ai-column-mapper";

export async function orchestrateBrokerColumnMapping(
  headers: string[],
  normalizedHeaders: string[],
  rows: any[][],
  headerRowIdx: number,
  aiMapper: { mapColumns: (cols: any[]) => Promise<any> }
): Promise<{
  mapping: Record<number, ColumnMapping>;
  aiSucceeded: boolean;
  aiAttempted: boolean;
  aiError?: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const deterministicMapping = mapBrokerColumnsDeterministically(headers, normalizedHeaders);
  const confidence = evaluateBrokerMappingConfidence(deterministicMapping);

  if (confidence >= 0.8) {
    return {
      mapping: deterministicMapping,
      aiSucceeded: false,
      aiAttempted: false,
      warnings
    };
  }

  // Fallback to AI
  const columnsToMap = headers.map((h, i) => {
    if (!h) return null;
    return {
      index: i,
      normalizedHeader: normalizedHeaders[i],
      valueShapes: sampleColumnShapes(rows.slice(headerRowIdx + 1), i)
    };
  }).filter(Boolean) as any[];

  if (columnsToMap.length === 0) {
    return { mapping: deterministicMapping, aiSucceeded: false, aiAttempted: false, warnings };
  }

  try {
    const aiResult = await aiMapper.mapColumns(columnsToMap);
    
    // Merge AI result conservatively
    const mergedMapping = { ...deterministicMapping };
    aiResult.mappings.forEach((aim: any) => {
      const idx = aim.columnIndex;
      const current = mergedMapping[idx];
      
      // AI cannot map EXTERNAL_ID directly (only deterministic or manual)
      if (aim.semantic === "EXTERNAL_ID") {
        warnings.push(`AI suggested EXTERNAL_ID for column "${headers[idx]}", but this is disabled for safety. Keeping unmapped.`);
        return;
      }

      if (!current || !current.semantic || (current.confidence < 0.8 && aim.confidence > current.confidence)) {
        mergedMapping[idx] = {
          columnIndex: idx,
          header: headers[idx],
          semantic: aim.semantic as BrokerColumnSemantic,
          confidence: aim.confidence,
          source: "ai"
        };
      } else if (current && current.semantic && current.semantic !== aim.semantic && aim.confidence >= 0.8 && current.confidence < 1.0) {
        warnings.push(`AI suggested ${aim.semantic} for column "${headers[idx]}" but deterministic mapping chose ${current.semantic}. Keeping deterministic.`);
      }
    });

    if (aiResult.warnings && aiResult.warnings.length > 0) {
      warnings.push(...aiResult.warnings);
    }

    return {
      mapping: mergedMapping,
      aiSucceeded: true,
      aiAttempted: true,
      warnings
    };
  } catch (err: any) {
    return {
      mapping: deterministicMapping,
      aiSucceeded: false,
      aiAttempted: true,
      aiError: err.message || "AI mapping failed",
      warnings
    };
  }
}
