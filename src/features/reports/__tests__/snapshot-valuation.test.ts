import { describe, it, expect } from "vitest";
import { calculateSnapshotValuation } from "../utils";

describe("calculateSnapshotValuation", () => {
  it("F. whitespace or blank currency is treated as invalid", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 100, currency: "   " }],
      cashBalances: [{ amount: 50, currency: "" }],
      totals: [{ type: "OVERALL", amount: 150, currency: " eur " }],
    });

    expect(res.investedValue).toBeNull();
    expect(res.investedCurrency).toBeNull();
    expect(res.cashValue).toBeNull();
    expect(res.cashCurrency).toBeNull();

    // OVERALL is respected since " eur " normalizes to "EUR"
    expect(res.totalValue).toBe(150);
    expect(res.totalCurrency).toBe("EUR");
  });

  it("A. position missing currency => invested null, cash ok", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 50, currency: null }],
      cashBalances: [{ amount: 10, currency: "EUR" }],
      totals: [],
    });
    expect(res.investedValue).toBeNull();
    expect(res.investedCurrency).toBeNull();
    expect(res.cashValue).toBe(10);
    expect(res.cashCurrency).toBe("EUR");
    expect(res.totalValue).toBeNull();
    expect(res.totalCurrency).toBeNull();
  });

  it("B. compatible positions + cash + OVERALL", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 100, currency: "USD" }],
      cashBalances: [{ amount: 50, currency: "EUR" }],
      totals: [{ type: "OVERALL", amount: 150, currency: "EUR" }],
    });
    expect(res.totalValue).toBe(150);
    expect(res.totalCurrency).toBe("EUR");
    expect(res.investedValue).toBe(100);
    expect(res.investedCurrency).toBe("USD");
    expect(res.cashValue).toBe(50);
    expect(res.cashCurrency).toBe("EUR");
  });

  it("C. positions EUR + position with unknown currency", () => {
    const res = calculateSnapshotValuation({
      positions: [
        { marketValue: 100, currency: "EUR" },
        { marketValue: 50, currency: null },
      ],
      cashBalances: [],
      totals: [],
    });
    expect(res.investedValue).toBeNull();
    expect(res.investedCurrency).toBeNull();
  });

  it("D. compatible EUR positions + EUR cash", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 100, currency: "EUR" }],
      cashBalances: [{ amount: 50, currency: "EUR" }],
      totals: [],
    });
    expect(res.investedValue).toBe(100);
    expect(res.investedCurrency).toBe("EUR");
    expect(res.cashValue).toBe(50);
    expect(res.cashCurrency).toBe("EUR");
    expect(res.totalValue).toBe(150);
    expect(res.totalCurrency).toBe("EUR");
  });

  it("E. multiple OVERALL records continue to be rejected as authoritative", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 100, currency: "EUR" }],
      cashBalances: [{ amount: 50, currency: "EUR" }],
      totals: [
        { type: "OVERALL", amount: 150, currency: "EUR" },
        { type: "OVERALL", amount: 200, currency: "EUR" },
      ],
    });
    // Falls back to safe sum since OVERALL is ambiguous, and they are both EUR
    expect(res.totalValue).toBe(150);
    expect(res.totalCurrency).toBe("EUR");
    expect(res.investedValue).toBe(100);
    expect(res.investedCurrency).toBe("EUR");
    expect(res.cashValue).toBe(50);
    expect(res.cashCurrency).toBe("EUR");
  });

  it("No positions => invested null", () => {
    const res = calculateSnapshotValuation({
      positions: [],
      cashBalances: [{ amount: 50, currency: "EUR" }],
      totals: [],
    });
    expect(res.investedValue).toBeNull();
    expect(res.investedCurrency).toBeNull();
  });

  it("No cash => cash null", () => {
    const res = calculateSnapshotValuation({
      positions: [{ marketValue: 100, currency: "EUR" }],
      cashBalances: [],
      totals: [],
    });
    expect(res.cashValue).toBeNull();
    expect(res.cashCurrency).toBeNull();
  });
});
