import { describe, it, expect } from "vitest";
import { EnableBankingClient } from "../enable-banking-client";

describe("EnableBankingClient strict balance parsing", () => {
  it("parses valid balances", async () => {
    const client = new EnableBankingClient();
    (client as any).request = async () => ({
      balances: [
        { balance_amount: { amount: "123.45", currency: "EUR" }, reference_date: "2024-01-01" },
        { balance_amount: { amount: "0.00", currency: "USD" } }
      ]
    });
    const res = await client.getBalances("uid");
    expect(res).toHaveLength(2);
    expect(res[0].amount).toBe(123.45);
    expect(res[0].date?.toISOString()).toContain("2024-01-01");
    expect(res[1].amount).toBe(0);
    expect(res[1].date).toBeUndefined();
  });

  it("skips invalid amounts", async () => {
    const client = new EnableBankingClient();
    (client as any).request = async () => ({
      balances: [
        { balance_amount: { amount: "123abc", currency: "EUR" } },
        { balance_amount: { amount: "Infinity", currency: "EUR" } },
        { balance_amount: { currency: "EUR" } } // missing amount
      ]
    });
    const res = await client.getBalances("uid");
    expect(res).toHaveLength(0);
  });

  it("handles invalid dates safely", async () => {
    const client = new EnableBankingClient();
    (client as any).request = async () => ({
      balances: [
        { balance_amount: { amount: "100", currency: "EUR" }, reference_date: "invalid-date" }
      ]
    });
    const res = await client.getBalances("uid");
    expect(res).toHaveLength(1);
    expect(res[0].amount).toBe(100);
    expect(res[0].date).toBeUndefined();
  });
});
