import { describe, it, expect } from "vitest";
import {
  extractDeterministic,
  isValidISIN,
  parseNumber,
  parseDate,
} from "../broker-import/deterministic-extractor";

describe("deterministic-extractor", () => {
  describe("parseDate", () => {
    it("parses YYYY-MM-DD", () => {
      expect(parseDate("Statement Date: 2026-08-30")).toBe("2026-08-30");
    });
    it("parses DD.MM.YYYY", () => {
      expect(parseDate("As of 30.08.2026")).toBe("2026-08-30");
    });
    it("parses DD/MM/YYYY", () => {
      expect(parseDate("date: 30/08/2026")).toBe("2026-08-30");
    });
  });

  describe("parseNumber", () => {
    it("parses basic decimals", () => {
      expect(parseNumber("203.00")).toBe(203);
    });
    it("parses US formatted thousands", () => {
      expect(parseNumber("41,328.14")).toBe(41328.14);
    });
    it("parses EU formatted thousands", () => {
      expect(parseNumber("41.328,14")).toBe(41328.14);
    });
    it("parses 6 decimals", () => {
      expect(parseNumber("2.560163")).toBe(2.560163);
    });
    it("parses comma decimal quantities", () => {
      expect(parseNumber("0,036985")).toBe(0.036985);
    });
  });

  describe("isValidISIN", () => {
    it("accepts valid ISINs", () => {
      expect(isValidISIN("US8740541094")).toBe(true);
      expect(isValidISIN("FR0013384369")).toBe(true);
      expect(isValidISIN("IE000I8KRLL9")).toBe(true);
    });

    it("rejects an invalid ISIN checksum", () => {
      expect(isValidISIN("US8740541095")).toBe(false);
    });
  });

  describe("extractDeterministic", () => {
    const RAW_TEXT = `NET WORTH STATEMENT
as of 30.08.2026
PORTFOLIO VALUE IN EUR
Brokerage 1,535.04
Crypto Wallet 2,488.28
Cash 41,328.14
TOTAL 45,351.46 EUR

BROKERAGE
PCS. / NOMINAL SECURITY NAME PRICE PER PIECE VALUE IN EUR
2.560163 Pcs. Take-Two Interactive Softw.Inc
Registered Shares DL -,01
ISIN: US8740541094
203.00
28.08.2026
519.71
7.722007 Pcs. Baikowski SAS
Actions Nominatives EO 1,25
ISIN: FR0013384369
Custody Location: France
23.00
28.08.2026
177.61
37.851829 Pcs. Carrefour S.A.
Actions Port. EO 2,5
ISIN: FR0000120172
Custody Location: France
15.60
28.08.2026
590.49
14.913434 Pcs. MSCI Global Semiconductors USD (Acc)
ISIN: IE000I8KRLL9
securities invoice in Germany
16.58
28.08.2026
247.23
NUMBER OF POSITIONS: 4 1,535.04 EUR

CRYPTO WALLET
Statement of Crypto assets in your Crypto Wallet as of 30.08.2026.
PCS. / NOMINAL SECURITY NAME PRICE PER PIECE VALUE IN EUR
0.036985 Pcs. Bitcoin
BTC
67,278.17
30.08.2026
2,488.28
NUMBER OF POSITIONS: 1 2,488.28 EUR

CASH
Statement of Cash in your Current Account as of 30.08.2026.
PRODUCT BALANCE
Current account 41,328.14 EUR`;

    it("extracts all components from the real multi-line structure", () => {
      const snapshot = extractDeterministic(RAW_TEXT);

      expect(snapshot.statementDate).toBe("2026-08-30");

      expect(snapshot.positions).toHaveLength(5);

      const takeTwo = snapshot.positions.find((p) => p.isin === "US8740541094");
      expect(takeTwo).toBeDefined();
      expect(takeTwo?.name).toBe("Take-Two Interactive Softw.Inc");
      expect(takeTwo?.quantity).toBe(2.560163);
      expect(takeTwo?.unitPrice).toBe(203.0);
      expect(takeTwo?.marketValue).toBe(519.71);
      expect(takeTwo?.valuationDate).toBe("2026-08-28");
      expect(takeTwo?.currency).toBe("EUR");
      expect(takeTwo?.sourceSection).toBe("BROKERAGE");

      const msci = snapshot.positions.find((p) => p.isin === "IE000I8KRLL9");

      expect(msci?.quantity).toBe(14.913434);
      expect(msci?.unitPrice).toBe(16.58);
      expect(msci?.marketValue).toBe(247.23);
      expect(msci?.currency).toBe("EUR");
      expect(msci?.assetClass).toBeNull();
      expect(msci?.valuationDate).toBe("2026-08-28");

      const btc = snapshot.positions.find((p) => p.ticker === "BTC");
      expect(btc).toBeDefined();
      expect(btc?.name).toBe("Bitcoin");
      expect(btc?.quantity).toBe(0.036985);
      expect(btc?.unitPrice).toBe(67278.17);
      expect(btc?.marketValue).toBe(2488.28);
      expect(btc?.valuationDate).toBe("2026-08-30");
      expect(btc?.currency).toBe("EUR");
      expect(btc?.assetClass).toBe("Crypto");
      expect(btc?.sourceSection).toBe("CRYPTO WALLET");

      expect(snapshot.capabilities).toEqual(
        expect.arrayContaining([
          "SNAPSHOT_DATE",
          "PORTFOLIO_TOTALS",
          "POSITIONS",
          "QUANTITIES",
          "PRICES",
          "MARKET_VALUES",
          "CASH_BALANCES",
        ]),
      );

      expect(snapshot.extractionWarnings).toBeUndefined();
      expect(snapshot.completeness).toBe("COMPLETE");
      expect(snapshot.cashBalances).toHaveLength(1);
      expect(snapshot.cashBalances[0].amount).toBe(41328.14);
      expect(snapshot.cashBalances[0].currency).toBe("EUR");

      expect(snapshot.totals).toHaveLength(4);

      const brokerageTotal = snapshot.totals.find(
        (t) => t.type === "SECTION_TOTAL" && t.label === "Brokerage",
      );

      const cryptoTotal = snapshot.totals.find(
        (t) => t.type === "SECTION_TOTAL" && t.label === "Crypto Wallet",
      );

      const cashTotal = snapshot.totals.find((t) => t.type === "CASH");

      const overallTotal = snapshot.totals.find((t) => t.type === "OVERALL");

      expect(brokerageTotal?.amount).toBe(1535.04);
      expect(brokerageTotal?.currency).toBe("EUR");

      expect(cryptoTotal?.amount).toBe(2488.28);
      expect(cryptoTotal?.currency).toBe("EUR");

      expect(cashTotal?.amount).toBe(41328.14);
      expect(cashTotal?.currency).toBe("EUR");

      expect(overallTotal?.amount).toBe(45351.46);
      expect(overallTotal?.currency).toBe("EUR");
    });

    it("handles malformed / partial input gracefully", () => {
      const partialText = `
        BROKERAGE
        10 Pcs. Apple
        150.00
        NUMBER OF POSITIONS: 1
      `;
      const snapshot = extractDeterministic(partialText);
      expect(snapshot.completeness).toBe("PARTIAL");
      expect(snapshot.positions).toHaveLength(1);
      expect(snapshot.positions[0].quantity).toBe(10);
      expect(snapshot.positions[0].unitPrice).toBeNull();
      expect(snapshot.positions[0].marketValue).toBeNull();

      expect(snapshot.extractionWarnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Ambiguous price/market value"),
        ]),
      );

      expect(snapshot.completeness).toBe("PARTIAL");
    });

    it("does not mark a snapshot complete when position and overall currencies differ", () => {
      const raw = `
    NET WORTH STATEMENT
    as of 30.08.2026
    PORTFOLIO VALUE IN EUR
    TOTAL 100.00 EUR

    EQUITIES
    SECURITY NAME PRICE PER PIECE VALUE IN USD
    1 Pcs. Example Asset
    10.00
    30.08.2026
    100.00
    NUMBER OF POSITIONS: 1
    `;

      const snapshot = extractDeterministic(raw);

      expect(snapshot.positions).toHaveLength(1);
      expect(snapshot.positions[0].currency).toBe("USD");
      expect(snapshot.totals.find((t) => t.type === "OVERALL")?.currency).toBe(
        "EUR",
      );
      expect(snapshot.completeness).toBe("PARTIAL");
    });

    it("returns UNKNOWN if nothing found", () => {
      const snapshot = extractDeterministic("hello world");
      expect(snapshot.completeness).toBe("UNKNOWN");
      expect(snapshot.positions).toHaveLength(0);
    });
  });
});
