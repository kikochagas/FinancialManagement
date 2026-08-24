import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

export async function getDashboardData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const accounts = await db.account.findMany({ where: { userId } });
  const investments = await db.investment.findMany({ where: { userId } });
  const goals = await db.goal.findMany({ where: { userId } });
  const taxReservations = await db.taxReservation.findMany({ where: { userId } });
  const categories = await db.category.findMany({ where: { userId } });

  // Use current date
  const now = new Date(); 
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const monthName = now.toLocaleString("en-US", { month: "short" });

  const currentMonthTransactions = await db.transaction.findMany({
    where: {
      userId,
      date: {
        gte: currentMonthStart,
        lte: currentMonthEnd,
      },
    },
  });

  const allTransactions = await db.transaction.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 8,
    include: {
      account: true,
      category: true,
    },
  });

  // Calculate Net Worth
  const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
  const netWorth = totalAccountBalance;

  // Liquid Assets: Bank, Trade Republic, Cash
  const liquidAssets = accounts
    .filter((a) => ["Bank", "Trade Republic", "Cash"].includes(a.type))
    .reduce((acc, a) => acc + a.balance, 0);

  // Investments: Total market value of all tracked investments
  const investmentsValue = investments.reduce((acc, inv) => acc + inv.marketValue, 0);

  // Trade Republic Balance
  const trAccount = accounts.find((a) => a.type === "Trade Republic");
  const trBalance = trAccount ? trAccount.balance : 0;

  // Monthly stats
  const currentIncome = currentMonthTransactions
    .filter((t) => t.direction === "Credit" && t.destinationAccountId === null)
    .reduce((acc, t) => acc + t.amount, 0);

  const currentExpenses = currentMonthTransactions
    .filter((t) => t.direction === "Debit" && t.destinationAccountId === null)
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const savingsRate = currentIncome > 0 ? ((currentIncome - currentExpenses) / currentIncome) * 100 : 0;

  // Dynamic Cards Logic
  const dynamicCards: Array<{ title: string; value: number; description: string; type: string }> = [];

  if (taxReservations.length > 0) {
    const latestTax = taxReservations[0];
    const taxRemaining = Math.max(0, latestTax.estimatedTaxLiability - latestTax.taxWithheld);
    if (taxRemaining > 0) {
      dynamicCards.push({
        title: "IRS Remaining",
        value: taxRemaining,
        description: "Estimated outstanding tax",
        type: "tax"
      });
    }
  }

  goals.forEach(g => {
    dynamicCards.push({
      title: g.name,
      value: g.currentAmount,
      description: `Target: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(g.targetAmount)}`,
      type: "goal"
    });
  });

  const sortedAccounts = [...accounts].sort((a, b) => b.balance - a.balance);
  for (const acc of sortedAccounts) {
    if (dynamicCards.length >= 4) break; // Keep it to 4 extra cards max to maintain a nice 10-card grid
    if (acc.type !== "Bank" && acc.type !== "Cash") {
      dynamicCards.push({
        title: `${acc.name} Balance`,
        value: acc.balance,
        description: `${acc.type} Account`,
        type: "account"
      });
    }
  }

  // Chart data: Net worth evolution (from MonthlySnapshots)
  const snapshots = await db.monthlySnapshot.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (snapshots.length === 0) {
    snapshots.push({
      id: "current",
      userId,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      netWorth,
      liquidAssets,
      investmentsValue,
      savingsRate,
      createdAt: now,
    });
  }

  // Chart data: Expenses by Category
  const categoryExpensesMap: Record<string, number> = {};
  currentMonthTransactions
    .filter((t) => t.direction === "Debit" && t.destinationAccountId === null && t.categoryId)
    .forEach((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      if (cat) {
        categoryExpensesMap[cat.name] = (categoryExpensesMap[cat.name] || 0) + Math.abs(t.amount);
      }
    });

  const expensesByCategory = Object.entries(categoryExpensesMap).map(([name, value]) => ({
    name,
    value,
    color: categories.find((c) => c.name === name)?.color || "#94a3b8",
  }));

  // Chart data: Income by Source
  const sourceIncomeMap: Record<string, number> = {};
  currentMonthTransactions
    .filter((t) => t.direction === "Credit" && t.destinationAccountId === null && t.categoryId)
    .forEach((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      if (cat) {
        sourceIncomeMap[cat.name] = (sourceIncomeMap[cat.name] || 0) + t.amount;
      }
    });

  const incomeBySource = Object.entries(sourceIncomeMap).map(([name, value]) => ({
    name,
    value,
    color: categories.find((c) => c.name === name)?.color || "#10B981",
  }));

  // Asset allocation charts
  const assetAllocations = await db.assetAllocation.findMany({ where: { userId } });

  const sixMonthsAgoStart = startOfMonth(subMonths(now, 5));
  const last6MonthsTransactions = await db.transaction.findMany({
    where: {
      userId,
      date: {
        gte: sixMonthsAgoStart,
        lte: currentMonthEnd,
      },
    },
  });

  return {
    metrics: {
      netWorth,
      liquidAssets,
      investmentsValue,
      monthlyIncome: currentIncome,
      monthlyExpenses: currentExpenses,
      savingsRate: savingsRate,
      monthName,
    },
    dynamicCards,
    recentTransactions: allTransactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      description: t.description,
      direction: t.direction,
      amount: t.amount,
      category: t.category?.name || "Uncategorized",
      color: t.category?.color || "#94a3b8",
      account: t.account?.name || "External",
    })),
    netWorthEvolution: snapshots.map((s) => {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        name: monthNames[s.month - 1] + " " + s.year,
        netWorth: s.netWorth,
        liquidAssets: s.liquidAssets,
        investmentsValue: s.investmentsValue,
      };
    }),
    cashFlow: Array.from({ length: 6 }).map((_, i) => {
      const mDate = subMonths(now, 5 - i);
      const mName = mDate.toLocaleString("en-US", { month: "short" });
      const mStart = startOfMonth(mDate).getTime();
      const mEnd = endOfMonth(mDate).getTime();

      const mTransactions = last6MonthsTransactions.filter(t => {
        const tTime = t.date.getTime();
        return tTime >= mStart && tTime <= mEnd;
      });

      const mInc = mTransactions.filter(t => t.direction === "Credit" && t.destinationAccountId === null).reduce((sum, t) => sum + t.amount, 0);
      const mExp = mTransactions.filter(t => t.direction === "Debit" && t.destinationAccountId === null).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      return { month: mName, Income: mInc, Expenses: mExp };
    }),
    expensesByCategory: expensesByCategory,
    incomeBySource: incomeBySource,
    assetAllocation: assetAllocations.length > 0 ? assetAllocations.map((a) => ({
      name: a.assetType,
      value: a.currentPercentage,
    })) : [
      { name: "Liquid Assets", value: liquidAssets },
      { name: "Investments", value: investmentsValue }
    ].filter(a => a.value > 0),
  };
}
