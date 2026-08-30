import { expect, test, describe } from "vitest";
import { parseBrokerNumberStrict } from "../../broker-import/number-parser";
import { parseBrokerDatetimeStrict } from "../../broker-import/date-parser";
import { normalizeEventType } from "../../broker-import/event-type-normalization";
import { isValidISIN, normalizeIdentifier } from "../../broker-import/identifier-normalization";
import { inferValueShape } from "../../broker-import/shape-inference";

describe("broker-import number-parser", () => {
  test("parses crypto precision safely without truncating", () => {
    const res = parseBrokerNumberStrict("0.00045123");
    expect(res.valid).toBe(true);
    expect(res.value).toBe(0.00045123);
  });

  test("parses negative amounts", () => {
    const res = parseBrokerNumberStrict("-150.50");
    expect(res.valid).toBe(true);
    expect(res.value).toBe(-150.50);
    expect(res.explicitSign).toBe("negative");
  });

  test("parses positive explicit amounts", () => {
    const res = parseBrokerNumberStrict("+150.50");
    expect(res.valid).toBe(true);
    expect(res.value).toBe(150.50);
    expect(res.explicitSign).toBe("positive");
  });

  test("parses European amounts", () => {
    const res = parseBrokerNumberStrict("-1.657,60");
    expect(res.valid).toBe(true);
    expect(res.value).toBe(-1657.60);
  });

  test("parses exactly 3 decimals", () => {
    expect(parseBrokerNumberStrict("0.123").value).toBe(0.123);
    expect(parseBrokerNumberStrict("1.234").value).toBe(1.234);
  });
});

describe("broker-import date-parser", () => {
  test("parses ISO datetime keeping precision", () => {
    const res = parseBrokerDatetimeStrict("2024-01-01T12:00:00Z");
    expect(res.valid).toBe(true);
    expect(res.value).toContain("2024-01-01T12:00:00.000Z");
  });

  test("parses DATE_DD_MM_YYYY", () => {
    const res = parseBrokerDatetimeStrict("05/10/2024");
    expect(res.valid).toBe(true);
    expect(res.value).toContain("2024-10-05");
  });
});

describe("broker-import event-type-normalization", () => {
  test("normalizes well-known types", () => {
    expect(normalizeEventType("TRANSFER_INBOUND")).toBe("CASH_DEPOSIT");
    expect(normalizeEventType("INTEREST_PAYMENT")).toBe("INTEREST");
    expect(normalizeEventType("MIGRATION")).toBe("CORPORATE_ACTION");
    expect(normalizeEventType("FREE_RECEIPT")).toBe("ASSET_TRANSFER_IN");
    expect(normalizeEventType("UNKNOWN_EVENT")).toBe(null); // Unknown remains null, requires manual map or ignore
  });
});

describe("broker-import identifier-normalization", () => {
  test("validates ISIN", () => {
    expect(isValidISIN("US8740541094")).toBe(true);
    expect(isValidISIN("FR0000120172")).toBe(true);
    expect(isValidISIN("IE000I8KRLL9")).toBe(true);
    expect(isValidISIN("BTC")).toBe(false); // Valid ticker, invalid ISIN
  });

  test("normalizeIdentifier separates correctly", () => {
    const r1 = normalizeIdentifier("US8740541094", null, null);
    expect(r1.isin).toBe("US8740541094");
    expect(r1.ticker).toBe(null);

    const r2 = normalizeIdentifier("BTC", null, null);
    expect(r2.isin).toBe(null);
    expect(r2.ticker).toBe("BTC");
  });
});

describe("broker-import shape-inference", () => {
  test("infers ISIN", () => {
    expect(inferValueShape("US8740541094")).toBe("ISIN_LIKE");
  });
  test("infers DATETIME", () => {
    expect(inferValueShape("2024-01-01T10:15:30")).toBe("DATETIME_ISO");
    expect(inferValueShape("2024-01-01 10:15:30")).toBe("DATETIME_ISO");
  });
});
