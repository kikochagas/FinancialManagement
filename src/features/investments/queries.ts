import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getInvestmentsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const investments = await db.investment.findMany({
    where: { userId },
    orderBy: { marketValue: "desc" },
  });

  return {
    investments: investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type, // Trade Republic Cash, Stocks, Bitcoin, Ethereum, Other Crypto
      symbol: inv.symbol || "",
      quantity: inv.quantity,
      costBasis: inv.costBasis,
      marketValue: inv.marketValue,
      profit: inv.profit,
      allocation: inv.allocation,
    })),
  };
}
