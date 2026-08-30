import { describe, test, expect } from "vitest";

// Helper mirroring the logic inside InvestmentsClient
export function parseTab(queryTab: string | null): "portfolio" | "activity" {
  return queryTab === "activity" ? "activity" : "portfolio";
}

describe("Investments Tab Parsing", () => {
  test("defaults to portfolio for null", () => {
    expect(parseTab(null)).toBe("portfolio");
  });

  test("returns activity when explicitly requested", () => {
    expect(parseTab("activity")).toBe("activity");
  });

  test("defaults to portfolio for unknown values", () => {
    expect(parseTab("invalid_tab")).toBe("portfolio");
    expect(parseTab("")).toBe("portfolio");
    expect(parseTab("PORTFOLIO")).toBe("portfolio");
  });
});
