import { describe, test, expect } from "vitest";
import {
  mapBrokerAssetClassToInvestmentType,
  InvestmentType,
} from "@/lib/constants";

describe("mapBrokerAssetClassToInvestmentType", () => {
  test("maps BTC and Bitcoin to BITCOIN", () => {
    expect(mapBrokerAssetClassToInvestmentType("Crypto", "BTC")).toBe(
      InvestmentType.BITCOIN,
    );
    expect(
      mapBrokerAssetClassToInvestmentType("Cryptocurrency", "BITCOIN"),
    ).toBe(InvestmentType.BITCOIN);
  });
  test("maps ETH and Ethereum to ETHEREUM", () => {
    expect(mapBrokerAssetClassToInvestmentType("Crypto", "ETH")).toBe(
      InvestmentType.ETHEREUM,
    );
    expect(
      mapBrokerAssetClassToInvestmentType("Cryptocurrency", "ETHEREUM"),
    ).toBe(InvestmentType.ETHEREUM);
  });
  test("maps other crypto to OTHER_CRYPTO", () => {
    expect(mapBrokerAssetClassToInvestmentType("Crypto", "ADA")).toBe(
      InvestmentType.OTHER_CRYPTO,
    );
  });
  test("maps non-crypto to STOCKS", () => {
    expect(mapBrokerAssetClassToInvestmentType("Equity", "AAPL")).toBe(
      InvestmentType.STOCKS,
    );
    expect(mapBrokerAssetClassToInvestmentType(null, "TSLA")).toBe(
      InvestmentType.STOCKS,
    );
  });
});
