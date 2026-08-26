import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getTransactionsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const transactions = await db.transaction.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      account: true,
      category: true,
      destinationAccount: true,
    },
  });

  const accounts = await db.account.findMany({ where: { userId } });
  const categories = await db.category.findMany({ where: { userId } });

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().split("T")[0],
      createdAt: t.createdAt.toISOString(),
      description: t.description,
      direction: t.direction as "Debit" | "Credit",
      amount: t.amount,
      accountId: t.accountId || "none",
      accountName: t.account?.name || "External",
      categoryId: t.categoryId || "",
      categoryName: t.category?.name || "Uncategorized",
      categoryColor: t.category?.color || "#94a3b8",
      destinationAccountId: t.destinationAccountId || "",
      destinationAccountName: t.destinationAccount?.name || "",
      tags: t.tags,
      notes: t.notes || "",
    })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color || "#94a3b8" })),
  };
}
