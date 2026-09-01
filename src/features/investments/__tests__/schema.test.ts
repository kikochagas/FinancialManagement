/**
 * Tests for BrokerSnapshotSchema — validates that enum values are correct
 * and rejects incorrect/legacy values.
 */
import { describe, it, expect } from 'vitest';
import { BrokerSnapshotSchema } from '../broker-import/schema';

const BASE_SNAPSHOT = {
  completeness: 'COMPLETE' as const,
  positions: [],
  cashBalances: [],
  totals: [],
};

describe('BrokerSnapshotSchema', () => {
  it('accepts a minimal valid snapshot', () => {
    const result = BrokerSnapshotSchema.safeParse(BASE_SNAPSHOT);
    expect(result.success).toBe(true);
  });

  describe('dateProvenance', () => {
    it('accepts DOCUMENT provenance', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, dateProvenance: 'DOCUMENT' });
      expect(r.success).toBe(true);
    });

    it('accepts USER_CONFIRMED provenance', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, dateProvenance: 'USER_CONFIRMED' });
      expect(r.success).toBe(true);
    });

    it('rejects DERIVED — no invented statement dates', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, dateProvenance: 'DERIVED' });
      expect(r.success).toBe(false);
    });

    it('rejects EXPLICIT — renamed to DOCUMENT', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, dateProvenance: 'EXPLICIT' });
      expect(r.success).toBe(false);
    });
  });

  describe('capabilities', () => {
    const allCapabilities = [
      'SNAPSHOT_DATE', 'CASH_BALANCES', 'POSITIONS', 'QUANTITIES',
      'PRICES', 'MARKET_VALUES', 'PORTFOLIO_TOTALS', 'ACTIVITY',
      'COST_BASIS', 'PNL',
    ];

    it('accepts all defined capability values', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, capabilities: allCapabilities });
      expect(r.success).toBe(true);
    });

    it('rejects legacy CASH capability value', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, capabilities: ['CASH'] });
      expect(r.success).toBe(false);
    });

    it('rejects legacy TOTALS capability value', () => {
      const r = BrokerSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, capabilities: ['TOTALS'] });
      expect(r.success).toBe(false);
    });
  });

  describe('cashBalances type enum', () => {
    it('accepts TOTAL cash type', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        cashBalances: [{ type: 'TOTAL', label: null, currency: 'EUR', amount: 1000 }],
      });
      expect(r.success).toBe(true);
    });

    it('accepts SETTLED / AVAILABLE / UNSETTLED / UNKNOWN cash types', () => {
      for (const t of ['SETTLED', 'AVAILABLE', 'UNSETTLED', 'UNKNOWN'] as const) {
        const r = BrokerSnapshotSchema.safeParse({
          ...BASE_SNAPSHOT,
          cashBalances: [{ type: t, label: null, currency: 'EUR', amount: 0 }],
        });
        expect(r.success).toBe(true);
      }
    });

    it('rejects BANK cash type — describes account type, not cash semantics', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        cashBalances: [{ type: 'BANK', label: null, currency: 'EUR', amount: 100 }],
      });
      expect(r.success).toBe(false);
    });

    it('rejects BROKER cash type — describes account type, not cash semantics', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        cashBalances: [{ type: 'BROKER', label: null, currency: 'EUR', amount: 100 }],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('totals type enum', () => {
    it('accepts CASH / INVESTED / OVERALL / SECTION_TOTAL / UNKNOWN total types', () => {
      for (const t of ['CASH', 'INVESTED', 'OVERALL', 'SECTION_TOTAL', 'UNKNOWN'] as const) {
        const r = BrokerSnapshotSchema.safeParse({
          ...BASE_SNAPSHOT,
          totals: [{ type: t, label: null, currency: 'EUR', amount: 0 }],
        });
        expect(r.success).toBe(true);
      }
    });

    it('rejects NET_WORTH — Dashboard concept, not a broker-report total', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        totals: [{ type: 'NET_WORTH', label: null, currency: 'EUR', amount: 100 }],
      });
      expect(r.success).toBe(false);
    });

    it('rejects LIQUID_ASSETS — Dashboard concept, not a broker-report total', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        totals: [{ type: 'LIQUID_ASSETS', label: null, currency: 'EUR', amount: 100 }],
      });
      expect(r.success).toBe(false);
    });

    it('rejects INVESTMENTS — ambiguous, use INVESTED', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        totals: [{ type: 'INVESTMENTS', label: null, currency: 'EUR', amount: 100 }],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('positions', () => {
    it('accepts a full position with per-position valuationDate', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        positions: [{
          name: 'Apple Inc.',
          sourceSection: 'Equities',
          assetClass: 'Equity',
          isin: 'US0378331005',
          ticker: 'AAPL',
          instrumentIdentifier: null,
          instrumentIdentifierType: null,
          quantity: 10,
          unitPrice: 150,
          marketValue: 1500,
          currency: 'USD',
          costBasis: 1200,
          pnl: 300,
          valuationDate: '2024-01-31',
        }],
      });
      expect(r.success).toBe(true);
    });

    it('accepts positions with null cost basis', () => {
      const r = BrokerSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        positions: [{
          name: 'Unknown ETF', sourceSection: null, assetClass: null,
          isin: null, ticker: 'ETF', instrumentIdentifier: null,
          instrumentIdentifierType: null, quantity: 5,
          unitPrice: null, marketValue: 500, currency: 'EUR',
          costBasis: null,
        }],
      });
      expect(r.success).toBe(true);
    });
  });
});
