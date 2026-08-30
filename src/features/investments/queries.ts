import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getInvestmentsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const investments = await db.investment.findMany({
    where: { userId },
    orderBy: { marketValue: "desc" },
  });

  const events = await db.investmentEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    include: { account: true },
  });

  const accounts = await db.account.findMany({
    where: { userId }
  });

  return {
    investments: investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type, // Stocks, Bitcoin, Ethereum, Other Crypto
      symbol: inv.symbol || "",
      quantity: inv.quantity,
      costBasis: inv.costBasis,
      marketValue: inv.marketValue,
      profit: inv.profit,
      allocation: inv.allocation,
    })),
    events: events.map((ev) => ({
      id: ev.id,
      accountId: ev.accountId,
      accountName: ev.account.name,
      occurredAt: ev.occurredAt.toISOString(),
      eventType: ev.eventType,
      instrumentName: ev.instrumentName,
      isin: ev.isin,
      ticker: ev.ticker,
      instrumentIdentifier: ev.instrumentIdentifier,
      quantity: ev.quantity,
      unitPrice: ev.unitPrice,
      amount: ev.amount,
      fee: ev.fee,
      tax: ev.tax,
      currency: ev.currency,
      description: ev.description,
      rawEventType: ev.rawEventType,
      rawCategory: ev.rawCategory,
    })),
    accounts: accounts.map(a => ({ id: a.id, name: a.name }))
  };
}
