import { describe, it, expect } from "vitest";
import { parseDateStrict } from "../../bank-import/date-parser";

describe("date-parser", () => {
  it("parses YYYY-MM-DD", () => {
    expect(parseDateStrict("2026-08-16")).toEqual({ valid: true, value: "2026-08-16" });
  });

  it("parses DD/MM/YYYY", () => {
    expect(parseDateStrict("16/08/2026")).toEqual({ valid: true, value: "2026-08-16" });
    expect(parseDateStrict("01-02-2026")).toEqual({ valid: true, value: "2026-02-01" });
  });

  it("parses Excel serial dates", () => {
    // 44197 is Jan 1, 2021
    expect(parseDateStrict(44197)).toEqual({ valid: true, value: "2021-01-01" });
  });

  it("fails safely on invalid input instead of using today", () => {
    const res1 = parseDateStrict("not a date");
    expect(res1.valid).toBe(false);
    expect(res1.value).toBeNull();
    
    const res2 = parseDateStrict(null);
    expect(res2.valid).toBe(false);
    expect(res2.value).toBeNull();
  });
});
