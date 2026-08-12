import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getAccountsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const accounts = await db.account.findMany({
    where: { userId },
    include: {
      transactions: {
        orderBy: { date: "desc" },
        take: 5,
        include: {
          category: true,
        },
      },
    },
  });

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency,
      recentTransactions: a.transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString().split("T")[0],
        description: t.description,
        type: t.type,
        amount: t.amount,
        category: t.category?.name || "Uncategorized",
        color: t.category?.color || "#94a3b8",
      })),
    })),
  };
}
