import { StructuredGenerationRequest } from "./types";

export interface AIProvider {
  /**
   * Generates a structured JSON response conforming to the provided Zod schema.
   * Throws an error if the underlying provider fails or if parsing fails.
   */
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}
