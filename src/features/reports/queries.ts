import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { ensureDefaultCategories } from "@/features/categories/default-categories";

export async function getReportsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const transactions = await db.transaction.findMany({
    where: { userId },
    include: {
      account: true,
      category: true,
      destinationAccount: true,
    },
    orderBy: { date: "desc" },
  });

  const accounts = await db.account.findMany({
    where: { userId },
    include: { externalMappings: true },
  });
  const categories = await ensureDefaultCategories(userId);
  const investments = await db.investment.findMany({ where: { userId } });
  const goals = await db.goal.findMany({ where: { userId } });
  const taxReservations = await db.taxReservation.findMany({
    where: { userId },
  });

  return {
    transactions: transactions.map((t) => ({
      date: t.date.toISOString().split("T")[0],
      description: t.description,
      direction: t.direction,
      amount: t.amount,
      accountName: t.account?.name || "External",
      destinationAccountName: t.destinationAccount?.name || "",
      categoryName: t.category?.name || "",
      tags: t.tags,
      notes: t.notes || "",
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency,
      isBankConnected: a.externalMappings.some(
        (m) => m.disconnectedAt === null,
      ),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      systemKey: c.systemKey,
    })),
    investments: investments.map((i) => ({
      name: i.name,
      type: i.type,
      costBasis: i.costBasis,
      marketValue: i.marketValue,
      profit: i.profit,
    })),
    goals: goals.map((g) => ({
      name: g.name,
      type: g.type,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progress: g.progress,
    })),
    taxReservation: taxReservations[0]
      ? {
          year: taxReservations[0].year,
          estimatedTaxLiability: taxReservations[0].estimatedTaxLiability,
          taxWithheld: taxReservations[0].taxWithheld,
          notes: taxReservations[0].notes || "",
        }
      : {
          year: 2026,
          estimatedTaxLiability: 11000,
          taxWithheld: 8500,
          notes: "",
        },
  };
}

import { calculateSnapshotValuation } from "./utils";

import { SubmittedReportHistoryItem } from "./types";

export async function getSubmittedReportsHistory(): Promise<
  SubmittedReportHistoryItem[]
> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const snapshots = await db.investmentAccountSnapshot.findMany({
    where: { userId },
    include: {
      account: true,
      positions: true,
      cashBalances: true,
      totals: true,
    },
    orderBy: [{ importedAt: "desc" }, { id: "desc" }],
  });

  return snapshots.map((s) => {
    const valuation = calculateSnapshotValuation(s);

    return {
      id: s.id,
      reportType: "Portfolio Snapshot",
      account: {
        id: s.account.id,
        name: s.account.name,
        type: s.account.type,
      },
      statementDate: s.statementDate.toISOString().split("T")[0],
      importedAt: s.importedAt.toISOString(),
      completeness: s.completeness,
      positionsCount: s.positions.length,
      investedValue: valuation.investedValue,
      cashValue: valuation.cashValue,
      totalValue: valuation.totalValue,
      totalCurrency: valuation.totalCurrency,
      investedCurrency: valuation.investedCurrency,
      cashCurrency: valuation.cashCurrency,

      positions: s.positions.map((p) => ({
        id: p.id,
        name: p.name,
        sourceSection: p.sourceSection,
        assetClass: p.assetClass,
        isin: p.isin,
        ticker: p.ticker,
        instrumentIdentifier: p.instrumentIdentifier,
        instrumentIdentifierType: p.instrumentIdentifierType,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        marketValue: p.marketValue,
        currency: p.currency,
        valuationDate: p.valuationDate
          ? p.valuationDate.toISOString().split("T")[0]
          : null,
      })),
      cashBalances: s.cashBalances.map((c) => ({
        id: c.id,
        type: c.type,
        label: c.label,
        amount: c.amount,
        currency: c.currency,
      })),
      totals: s.totals.map((t) => ({
        id: t.id,
        type: t.type,
        label: t.label,
        amount: t.amount,
        currency: t.currency,
      })),
      statementDateSource: s.statementDateSource,
    };
  });
}
