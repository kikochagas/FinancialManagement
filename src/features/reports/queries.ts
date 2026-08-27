import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

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
    include: { externalMappings: true }
  });
  const categories = await db.category.findMany({ where: { userId } });
  const investments = await db.investment.findMany({ where: { userId } });
  const goals = await db.goal.findMany({ where: { userId } });
  const taxReservations = await db.taxReservation.findMany({ where: { userId } });

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
      isBankConnected: a.externalMappings.some((m) => m.disconnectedAt === null),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
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
