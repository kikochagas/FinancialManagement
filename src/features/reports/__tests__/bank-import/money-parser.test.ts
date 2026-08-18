import { describe, it, expect } from "vitest";
import { parseMoneyStrict } from "../../bank-import/money-parser";

describe("money-parser", () => {
  it("parses valid EUROPEAN formats", () => {
    expect(parseMoneyStrict("14,74")).toMatchObject({ valid: true, value: 14.74 });
    expect(parseMoneyStrict("-14,74")).toMatchObject({ valid: true, value: -14.74, explicitSign: "negative" });
    expect(parseMoneyStrict("1.234,56")).toMatchObject({ valid: true, value: 1234.56 });
    expect(parseMoneyStrict("1.234.567,89")).toMatchObject({ valid: true, value: 1234567.89 });
  });

  it("parses valid US/ENGLISH formats", () => {
    expect(parseMoneyStrict("14.74")).toMatchObject({ valid: true, value: 14.74 });
    expect(parseMoneyStrict("-14.74")).toMatchObject({ valid: true, value: -14.74, explicitSign: "negative" });
    expect(parseMoneyStrict("1,234.56")).toMatchObject({ valid: true, value: 1234.56 });
    expect(parseMoneyStrict("1,234,567.89")).toMatchObject({ valid: true, value: 1234567.89 });
  });

  it("rejects AMBIGUOUS formats", () => {
    expect(parseMoneyStrict("1.234")).toMatchObject({ valid: false, warning: "Ambiguous number format" });
    expect(parseMoneyStrict("1,234")).toMatchObject({ valid: false, warning: "Ambiguous number format" });
    expect(parseMoneyStrict("1.234.567")).toMatchObject({ valid: false, warning: "Ambiguous number format" });
    expect(parseMoneyStrict("1,234,567")).toMatchObject({ valid: false, warning: "Ambiguous number format" });
  });

  it("rejects INVALID formats", () => {
    expect(parseMoneyStrict("1,234.567,89")).toMatchObject({ valid: false });
    expect(parseMoneyStrict("1.234,567.89")).toMatchObject({ valid: false });
    expect(parseMoneyStrict("1,23,456")).toMatchObject({ valid: false });
    expect(parseMoneyStrict("1.23.456")).toMatchObject({ valid: false });
    expect(parseMoneyStrict("12EUR34")).toMatchObject({ valid: false, warning: "Multiple or embedded currencies detected" });
    expect(parseMoneyStrict("EUR12USD")).toMatchObject({ valid: false, warning: "Multiple or embedded currencies detected" });
  });

  it("parses EXPLICIT SIGN metadata and canonical currencies", () => {
    expect(parseMoneyStrict("+128.00")).toMatchObject({ valid: true, value: 128, explicitSign: "positive" });
    expect(parseMoneyStrict("EUR +128.00")).toMatchObject({ valid: true, value: 128, explicitSign: "positive", currency: "EUR" });
    expect(parseMoneyStrict("+128,00 EUR")).toMatchObject({ valid: true, value: 128, explicitSign: "positive", currency: "EUR" });
    expect(parseMoneyStrict("-128.00")).toMatchObject({ valid: true, value: -128, explicitSign: "negative" });
    expect(parseMoneyStrict("EUR -128.00")).toMatchObject({ valid: true, value: -128, explicitSign: "negative", currency: "EUR" });
  });

  it("maps explicit canonical currencies correctly, and leaves bare $ to undefined per rule A", () => {
    expect(parseMoneyStrict("€ 12").currency).toBe("EUR");
    expect(parseMoneyStrict("eur 12").currency).toBe("EUR");
    expect(parseMoneyStrict("EUR 12").currency).toBe("EUR");
    
    // Bare $ is unknown
    expect(parseMoneyStrict("$ 12").currency).toBeUndefined();
    expect(parseMoneyStrict("usd 12").currency).toBe("USD");
    
    expect(parseMoneyStrict("£ 12").currency).toBe("GBP");
    expect(parseMoneyStrict("gbp 12").currency).toBe("GBP");
  });
});
