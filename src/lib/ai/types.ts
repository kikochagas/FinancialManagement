import { z } from "zod";

export interface StructuredGenerationRequest<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  schemaName: string;
  schemaDescription: string;
}
