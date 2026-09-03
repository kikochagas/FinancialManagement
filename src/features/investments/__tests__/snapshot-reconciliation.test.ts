import { describe, it, expect } from "vitest";
import {
  reconcileSnapshot,
  ExistingInvestment,
} from "../broker-import/reconciliation";
import { BrokerSnapshot, BrokerPosition } from "../broker-import/schema";

describe("snapshot-reconciliation", () => {
  const accountId = "acc-123";

  const createSnapshot = (
    positions: Partial<BrokerPosition>[],
  ): BrokerSnapshot => ({
    statementDate: "2026-08-30",
    completeness: "COMPLETE",
    positions: positions.map(
      (p) =>
        ({
          name: null,
          sourceSection: null,
          assetClass: null,
          isin: null,
          ticker: null,
          instrumentIdentifier: null,
          instrumentIdentifierType: null,
          quantity: null,
          unitPrice: null,
          marketValue: null,
          currency: null,
          valuationDate: null,
          ...p,
        }) as BrokerPosition,
    ),
    cashBalances: [],
    totals: [],
  });

  const createInvestment = (
    overrides: Partial<ExistingInvestment>,
  ): ExistingInvestment => ({
    id: "inv-1",
    accountId,
    name: "Test Investment",
    type: "Stocks",
    symbol: null,
    quantity: 10,
    marketValue: 100,
    isin: null,
    instrumentIdentifier: null,
    instrumentIdentifierType: null,
    ...overrides,
  });

  it("exact ISIN match (UNCHANGED)", () => {
    const snapshot = createSnapshot([
      { isin: "US8740541094", quantity: 10, marketValue: 100 },
    ]);
    const investments = [
      createInvestment({
        id: "i1",
        isin: "US8740541094",
        quantity: 10,
        marketValue: 100,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].status).toBe("UNCHANGED");
    expect(result.positions[0].matchMethod).toBe("ISIN");
    expect(result.positions[0].matchedInvestmentId).toBe("i1");
    expect(result.positions[0].proposedChanges).toBeNull();
  });

  it("account scoping (ISIN in different account must NOT match)", () => {
    const snapshot = createSnapshot([
      { isin: "US8740541094", quantity: 10, marketValue: 100 },
    ]);
    const investments = [
      createInvestment({
        id: "i1",
        isin: "US8740541094",
        accountId: "different-acc",
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions[0].status).toBe("NEW");
    expect(result.positions[0].matchMethod).toBe("NONE");
    expect(result.positions[0].matchedInvestmentId).toBeNull();
  });

  it("generic stable identifier match", () => {
    const snapshot = createSnapshot([
      {
        instrumentIdentifier: "12345",
        instrumentIdentifierType: "CUSIP",
        quantity: 10,
        marketValue: 100,
      },
    ]);
    const investments = [
      createInvestment({
        id: "i2",
        instrumentIdentifier: "12345",
        instrumentIdentifierType: "CUSIP",
        quantity: 10,
        marketValue: 100,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("UNCHANGED");
    expect(result.positions[0].matchMethod).toBe("STABLE_ID");
    expect(result.positions[0].matchedInvestmentId).toBe("i2");
  });

  it("unique ticker match (with diffs)", () => {
    const snapshot = createSnapshot([
      { ticker: "BTC", quantity: 15, marketValue: 150 },
    ]);
    const investments = [
      createInvestment({
        id: "i3",
        symbol: "BTC",
        quantity: 10,
        marketValue: 100,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("MATCHED");
    expect(result.positions[0].matchMethod).toBe("TICKER");
    expect(result.positions[0].proposedChanges).toEqual({
      quantity: 15,
      marketValue: 150,
    });
  });

  it("duplicate ticker -> AMBIGUOUS", () => {
    const snapshot = createSnapshot([{ ticker: "BTC" }]);
    const investments = [
      createInvestment({ id: "i4", symbol: "BTC" }),
      createInvestment({ id: "i5", symbol: "BTC" }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("AMBIGUOUS");
    expect(result.positions[0].matchMethod).toBe("TICKER");
    expect(result.positions[0].matchedInvestmentId).toBeNull();
  });

  it("ticker + conflicting ISIN -> CONFLICT", () => {
    const snapshot = createSnapshot([{ ticker: "AAPL", isin: "US0378331005" }]);
    const investments = [
      createInvestment({ id: "i6", symbol: "AAPL", isin: "WRONG-ISIN" }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("CONFLICT");
    expect(result.positions[0].matchMethod).toBe("TICKER");
    expect(result.positions[0].matchedInvestmentId).toBe("i6"); // it matched, but conflict
    expect(result.positions[0].reason).toMatch(/identifiers conflict/);
  });

  it("normalized-name fallback", () => {
    const snapshot = createSnapshot([{ name: "Apple Inc." }]);
    const investments = [createInvestment({ id: "i7", name: "apple inc" })];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("AMBIGUOUS");
    expect(result.positions[0].matchMethod).toBe("NAME");
    expect(result.positions[0].matchedInvestmentId).toBe("i7");
    expect(result.positions[0].reason).toMatch(/Weak match by normalized name/);
  });

  it("completely new position", () => {
    const snapshot = createSnapshot([{ isin: "US5949181045", quantity: 5 }]);
    const investments: ExistingInvestment[] = [];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("NEW");
    expect(result.positions[0].matchMethod).toBe("NONE");
    expect(result.positions[0].matchedInvestmentId).toBeNull();
  });

  it("null/unknown identifiers", () => {
    const snapshot = createSnapshot([
      { name: null, isin: null, ticker: null, instrumentIdentifier: null },
    ]);
    const investments = [
      createInvestment({ id: "i8", name: "Random", isin: null }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("NEW");
  });

  it("missing existing position does not create deletion proposal", () => {
    const snapshot = createSnapshot([{ isin: "US8740541094", quantity: 10 }]);
    const investments = [
      createInvestment({ id: "i1", isin: "US8740541094", quantity: 10 }),
      createInvestment({ id: "i2", isin: "OTHER-ISIN", quantity: 50 }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    // It should only return 1 position, the one from the snapshot
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].matchedInvestmentId).toBe("i1");
    // We do NOT add i2 to the result. It is simply ignored per rules.
  });

  it("Bitcoin ticker reconciliation", () => {
    const snapshot = createSnapshot([
      { ticker: "BTC", quantity: 0.036985, marketValue: 2488.28 },
    ]);
    const investments = [
      createInvestment({
        id: "btc-1",
        symbol: "BTC",
        quantity: 0.03,
        marketValue: 2000,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("MATCHED");
    expect(result.positions[0].matchedInvestmentId).toBe("btc-1");
    expect(result.positions[0].proposedChanges).toEqual({
      quantity: 0.036985,
      marketValue: 2488.28,
    });
  });

  it("proposed quantity/marketValue differences", () => {
    const snapshot = createSnapshot([
      { isin: "US0378331005", quantity: 20, marketValue: 400 },
    ]);
    const investments = [
      createInvestment({
        id: "abc-1",
        isin: "US0378331005",
        quantity: 10,
        marketValue: 100,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);
    expect(result.positions[0].status).toBe("MATCHED");
    expect(result.positions[0].proposedChanges).toEqual({
      quantity: 20,
      marketValue: 400,
    });
  });

  it("does not use an invalid ISIN as a strong match", () => {
    const snapshot = createSnapshot([
      { isin: "ABC", quantity: 10, marketValue: 100 },
    ]);
    const investments = [
      createInvestment({
        id: "invalid-isin",
        isin: "ABC",
        quantity: 10,
        marketValue: 100,
      }),
    ];
    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions[0].status).toBe("NEW");
    expect(result.positions[0].matchMethod).toBe("NONE");
    expect(result.positions[0].matchedInvestmentId).toBeNull();
  });

  it("does not let an invalid ISIN identifier create a ticker conflict", () => {
    const snapshot = createSnapshot([
      {
        ticker: "AAPL",
        instrumentIdentifier: "ABC",
        instrumentIdentifierType: "ISIN",
        quantity: 10,
        marketValue: 100,
      },
    ]);

    const investments = [
      createInvestment({
        id: "aapl-1",
        symbol: "AAPL",
        instrumentIdentifier: "US0378331005",
        instrumentIdentifierType: "ISIN",
        quantity: 10,
        marketValue: 100,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions[0].status).toBe("UNCHANGED");
    expect(result.positions[0].matchMethod).toBe("TICKER");
    expect(result.positions[0].matchedInvestmentId).toBe("aapl-1");
  });

  it("does not propose an invalid ISIN generic identifier", () => {
    const snapshot = createSnapshot([
      {
        ticker: "AAPL",
        instrumentIdentifier: "ABC",
        instrumentIdentifierType: "ISIN",
        quantity: 20,
        marketValue: 200,
      },
    ]);

    const investments = [
      createInvestment({
        id: "aapl-1",
        symbol: "AAPL",
        quantity: 10,
        marketValue: 100,
        instrumentIdentifier: null,
        instrumentIdentifierType: null,
      }),
    ];

    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions[0].status).toBe("MATCHED");
    expect(result.positions[0].proposedChanges).toEqual({
      quantity: 20,
      marketValue: 200,
    });

    expect(
      result.positions[0].proposedChanges?.instrumentIdentifier,
    ).toBeUndefined();
  });

  it("does not use an invalid ISIN as a generic identifier", () => {
    const snapshot = createSnapshot([
      {
        isin: null,
        instrumentIdentifier: "ABC",
        instrumentIdentifierType: "ISIN",
      },
    ]);
    const investments = [
      createInvestment({
        id: "invalid-generic",
        instrumentIdentifier: "ABC",
        instrumentIdentifierType: "ISIN",
      }),
    ];
    const result = reconcileSnapshot(snapshot, accountId, investments);

    expect(result.positions[0].status).toBe("NEW");
    expect(result.positions[0].matchMethod).toBe("NONE");
    expect(result.positions[0].matchedInvestmentId).toBeNull();
  });
});
