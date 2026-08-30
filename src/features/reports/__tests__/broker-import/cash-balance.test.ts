import { describe, test, expect } from "vitest";
import { deriveEventCashImpact, calculateAccountBalance } from "../../broker-import/cash-balance";

describe("broker-import cash-balance deriveEventCashImpact", () => {
  test("BUY with fees and tax", () => {
    expect(deriveEventCashImpact({ eventType: "BUY", amount: -100, fee: -1, tax: -0.5, currency: "EUR" })).toBe(-101.5);
  });

  test("SELL with fees", () => {
    expect(deriveEventCashImpact({ eventType: "SELL", amount: 100, fee: -1, tax: null, currency: "EUR" })).toBe(99);
  });

  test("DIVIDEND with tax", () => {
    expect(deriveEventCashImpact({ eventType: "DIVIDEND", amount: 10, fee: null, tax: -1, currency: "EUR" })).toBe(9);
  });

  test("DIVIDEND cancellation", () => {
    expect(deriveEventCashImpact({ eventType: "DIVIDEND", amount: -10, fee: null, tax: null, currency: "EUR" })).toBe(-10);
  });

  test("CASH_DEPOSIT and WITHDRAWAL", () => {
    expect(deriveEventCashImpact({ eventType: "CASH_DEPOSIT", amount: 500, fee: null, tax: null, currency: "EUR" })).toBe(500);
    expect(deriveEventCashImpact({ eventType: "CASH_WITHDRAWAL", amount: -200, fee: null, tax: null, currency: "EUR" })).toBe(-200);
  });

  test("CORPORATE_ACTION ignores unit price", () => {
    expect(deriveEventCashImpact({ eventType: "CORPORATE_ACTION", amount: null, fee: null, tax: null, currency: "EUR" })).toBe(0);
    expect(deriveEventCashImpact({ eventType: "CORPORATE_ACTION", amount: 10, fee: null, tax: null, currency: "EUR" })).toBe(10);
  });

  test("ASSET_TRANSFER_IN/OUT returns only explicit monetary values", () => {
    expect(deriveEventCashImpact({ eventType: "ASSET_TRANSFER_IN", amount: null, fee: null, tax: null, currency: "EUR" })).toBe(0);
    expect(deriveEventCashImpact({ eventType: "ASSET_TRANSFER_OUT", amount: null, fee: -10, tax: null, currency: "EUR" })).toBe(-10);
  });

  test("FEE deterministic rule", () => {
    expect(deriveEventCashImpact({ eventType: "FEE", amount: -1, fee: -1, tax: null, currency: "EUR" })).toBe(-1);
    expect(deriveEventCashImpact({ eventType: "FEE", amount: null, fee: -1, tax: null, currency: "EUR" })).toBe(-1);
    expect(deriveEventCashImpact({ eventType: "FEE", amount: -1, fee: null, tax: null, currency: "EUR" })).toBe(-1);
    expect(deriveEventCashImpact({ eventType: "FEE", amount: -2, fee: -1, tax: null, currency: "EUR" })).toBe(-1);
    expect(deriveEventCashImpact({ eventType: "FEE", amount: null, fee: -1, tax: -0.5, currency: "EUR" })).toBe(-1.5);
  });

  test("TAX deterministic rule", () => {
    expect(deriveEventCashImpact({ eventType: "TAX", amount: -2, fee: null, tax: -2, currency: "EUR" })).toBe(-2);
    expect(deriveEventCashImpact({ eventType: "TAX", amount: null, fee: null, tax: -2, currency: "EUR" })).toBe(-2);
    expect(deriveEventCashImpact({ eventType: "TAX", amount: -1, fee: null, tax: -2, currency: "EUR" })).toBe(-2);
    expect(deriveEventCashImpact({ eventType: "TAX", amount: null, fee: -0.5, tax: -2, currency: "EUR" })).toBe(-2.5);
  });
});

describe("broker-import cash-balance calculateAccountBalance", () => {
  test("Sums safely", () => {
    const events = [
      { eventType: "CASH_DEPOSIT", amount: 1000, fee: null, tax: null, currency: "EUR" },
      { eventType: "BUY", amount: -100, fee: -1, tax: null, currency: "EUR" }, // -101
      { eventType: "DIVIDEND", amount: 10, fee: null, tax: -1, currency: "EUR" }, // 9
      { eventType: "IGNORE", amount: 9999, fee: null, tax: null, currency: "EUR" },
      { eventType: "UNMAPPED", amount: 9999, fee: null, tax: null, currency: "EUR" },
    ];
    const res = calculateAccountBalance(events, "EUR");
    expect(res.isSafe).toBe(true);
    expect(res.balance).toBe(908);
  });

  test("Currency mismatch makes it unsafe", () => {
    const events = [
      { eventType: "CASH_DEPOSIT", amount: 1000, fee: null, tax: null, currency: "EUR" },
      { eventType: "BUY", amount: -100, fee: null, tax: null, currency: "USD" },
    ];
    const res = calculateAccountBalance(events, "EUR");
    expect(res.isSafe).toBe(false);
  });

  test("Missing currency makes it unsafe", () => {
    const events = [
      { eventType: "CASH_DEPOSIT", amount: 100, fee: null, tax: null, currency: null },
    ];
    const res = calculateAccountBalance(events, "EUR");
    expect(res.isSafe).toBe(false);
  });

  test("Mixed currency ok if no impact", () => {
    const events = [
      { eventType: "CASH_DEPOSIT", amount: 1000, fee: null, tax: null, currency: "EUR" },
      { eventType: "CORPORATE_ACTION", amount: null, fee: null, tax: null, currency: "USD" },
      { eventType: "CORPORATE_ACTION", amount: null, fee: null, tax: null, currency: null },
    ];
    const res = calculateAccountBalance(events, "EUR");
    expect(res.isSafe).toBe(true);
    expect(res.balance).toBe(1000);
  });

  test("fixture reconciliation (41328.14)", () => {
    const events = [
      { eventType: "CASH_DEPOSIT", amount: 50000, fee: null, tax: null, currency: "EUR" }, // +50000
      { eventType: "BUY", amount: -10000, fee: -10, tax: -2, currency: "EUR" }, // -10012
      { eventType: "SELL", amount: 2000, fee: -5, tax: null, currency: "EUR" }, // +1995
      { eventType: "DIVIDEND", amount: 250, fee: null, tax: -25, currency: "EUR" }, // +225
      { eventType: "DIVIDEND", amount: -250, fee: null, tax: 25, currency: "EUR" }, // -225
      { eventType: "FEE", amount: -15.86, fee: null, tax: null, currency: "EUR" }, // -15.86
      { eventType: "TAX", amount: null, fee: null, tax: -14, currency: "EUR" }, // -14
      { eventType: "CASH_WITHDRAWAL", amount: -625, fee: null, tax: null, currency: "EUR" }, // -625
      { eventType: "CORPORATE_ACTION", amount: null, fee: null, tax: null, currency: "USD" }, // 0
      { eventType: "IGNORE", amount: 1234, fee: null, tax: null, currency: "EUR" } // 0
    ];
    // 50000 - 10012 + 1995 + 225 - 225 - 15.86 - 14 - 625 = 41328.14
    const res = calculateAccountBalance(events, "EUR");
    expect(res.isSafe).toBe(true);
    expect(res.balance).toBe(41328.14);
  });
});
