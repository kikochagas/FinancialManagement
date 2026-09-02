import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { canHoldInvestments } from "@/lib/constants";

export async function getInvestmentsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const investments = await db.investment.findMany({
    where: { userId },
    orderBy: { marketValue: "desc" },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  const events = await db.investmentEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    include: { account: true },
  });

  const accounts = await db.account.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });

  return {
    investments: investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      symbol: inv.symbol || "",
      isin: inv.isin || "",
      accountId: inv.accountId,
      accountName: inv.account?.name ?? null,
      accountType: inv.account?.type ?? null,
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

    // Existing Activity-tab account list stays unchanged.
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
    })),

    // Used only when creating/editing current holdings.
    investmentAccounts: accounts
      .filter((account) => canHoldInvestments(account.type))
      .map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
      })),
  };
}