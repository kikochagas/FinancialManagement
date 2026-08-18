import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AIProvider } from "../provider";
import { StructuredGenerationRequest } from "../types";

export class OpenAIAdapter implements AIProvider {
  private client: OpenAI | null = null;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || ""; // No hardcoded fallback

    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    if (!this.client || !this.model) {
      throw new Error("AI_MAPPING_UNAVAILABLE: OpenAI configuration is missing.");
    }

    try {
      const response = await this.client.responses.parse({
        model: this.model,
        input: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        text: { format: zodTextFormat(request.schema, request.schemaName) },
      });

      const parsed = response.output_parsed;

      if (!parsed) {
        throw new Error("AI_MAPPING_UNAVAILABLE");
      }

      return parsed as T;
    } catch (error: any) {
      // Safe error logging
      console.error("OpenAIAdapter Error:", {
        status: error?.status,
        code: error?.code,
        name: error?.name
      });
      throw new Error("AI_MAPPING_UNAVAILABLE");
    }
  }
}

// Export a singleton instance
export const openAIProvider = new OpenAIAdapter();
