"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateSettingsSchema = z.object({
  theme: z.enum(["Dark", "Light", "System"]),
  currency: z.string().min(1),
  language: z.string().min(1),
});

export const updateSettings = authActionClient
  .schema(updateSettingsSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const settings = await db.settings.upsert({
      where: { userId },
      create: {
        userId,
        theme: parsedInput.theme,
        currency: parsedInput.currency,
        language: parsedInput.language,
      },
      update: {
        theme: parsedInput.theme,
        currency: parsedInput.currency,
        language: parsedInput.language,
      },
    });

    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true, settings };
  });

export const resetAndSeedDatabase = authActionClient.action(async ({ ctx: { userId } }) => {
  try {
    // We only clean data for the current user
    await db.settings.deleteMany({ where: { userId } }).catch(() => {});
    await db.assetAllocation.deleteMany({ where: { userId } }).catch(() => {});
    await db.taxReservation.deleteMany({ where: { userId } }).catch(() => {});
    await db.budget.deleteMany({ where: { userId } }).catch(() => {});
    await db.monthlySnapshot.deleteMany({ where: { userId } }).catch(() => {});
    await db.goal.deleteMany({ where: { userId } }).catch(() => {});
    await db.investment.deleteMany({ where: { userId } }).catch(() => {});
    await db.transaction.deleteMany({ where: { userId } }).catch(() => {});
    await db.category.deleteMany({ where: { userId } }).catch(() => {});
    await db.account.deleteMany({ where: { userId } }).catch(() => {});

    // 2. Create Settings
    await db.settings.create({
      data: {
        userId,
        theme: "Dark",
        currency: "EUR",
        language: "English",
      },
    });

    // 3. Create Accounts
    const bank = await db.account.create({
      data: {
        userId,
        name: "Main Bank Account",
        type: "Bank",
        balance: 2000.0,
        currency: "EUR",
      },
    });

    const tr = await db.account.create({
      data: {
        userId,
        name: "Trade Republic",
        type: "Trade Republic",
        balance: 35326.96,
        currency: "EUR",
      },
    });

    const coverflex1 = await db.account.create({
      data: {
        userId,
        name: "Coverflex Meal",
        type: "Coverflex 1",
        balance: 0.0,
        currency: "EUR",
      },
    });

    const coverflex2 = await db.account.create({
      data: {
        userId,
        name: "Coverflex Benefits",
        type: "Coverflex 2",
        balance: 0.0,
        currency: "EUR",
      },
    });

    const cash = await db.account.create({
      data: {
        userId,
        name: "Physical Cash",
        type: "Cash",
        balance: 150.0,
        currency: "EUR",
      },
    });

    const cryptoWallet = await db.account.create({
      data: {
        userId,
        name: "Hardware Wallet",
        type: "Crypto Wallet",
        balance: 1925.0,
        currency: "EUR",
      },
    });

    const broker = await db.account.create({
      data: {
        userId,
        name: "Broker Account",
        type: "Broker",
        balance: 850.0,
        currency: "EUR",
      },
    });

    // 4. Create Categories
    const categoryNames = [
      { name: "Phone", type: "Expense", color: "#3B82F6" },
      { name: "DECO", type: "Expense", color: "#6366F1" },
      { name: "ChatGPT", type: "Expense", color: "#10B981" },
      { name: "Fuel", type: "Expense", color: "#F59E0B" },
      { name: "Gym", type: "Expense", color: "#EC4899" },
      { name: "Trips", type: "Expense", color: "#8B5CF6" },
      { name: "Family", type: "Expense", color: "#EF4444" },
      { name: "Health Insurance", type: "Expense", color: "#14B8A6" },
      { name: "Car Insurance", type: "Expense", color: "#F97316" },
      { name: "Car Maintenance", type: "Expense", color: "#64748B" },
      { name: "Food", type: "Expense", color: "#A855F7" },
      { name: "Leisure", type: "Expense", color: "#06B6D4" },
      { name: "Salary", type: "Income", color: "#22C55E" },
      { name: "Investment Profit", type: "Interest", color: "#EAB308" },
      { name: "Tax Reservation", type: "Tax", color: "#EF4444" },
    ];

    const categories: Record<string, any> = {};
    for (const cat of categoryNames) {
      categories[cat.name] = await db.category.create({
        data: { ...cat, userId },
      });
    }

    const expensesList = [
      { name: "Phone", amount: 62 },
      { name: "DECO", amount: 18 },
      { name: "ChatGPT", amount: 23 },
      { name: "Fuel", amount: 100 },
      { name: "Gym", amount: 256 },
      { name: "Trips", amount: 100 },
      { name: "Family", amount: 500 },
      { name: "Health Insurance", amount: 34 },
      { name: "Car Insurance", amount: 42 },
      { name: "Car Maintenance", amount: 58 },
      { name: "Food", amount: 300 },
      { name: "Leisure", amount: 500 },
    ];

    // Seed June 2026 expenses
    for (const exp of expensesList) {
      await db.transaction.create({
        data: {
          userId,
          date: new Date(2026, 5, 10),
          description: `Monthly ${exp.name} payment`,
          type: "Expense",
          amount: exp.amount,
          categoryId: categories[exp.name].id,
          accountId: bank.id,
          tags: "monthly,fixed",
        },
      });
    }

    // Seed June 2026 Income
    await db.transaction.create({
      data: {
        userId,
        date: new Date(2026, 5, 28),
        description: "Monthly Salary Deposit",
        type: "Income",
        amount: 4500.0,
        categoryId: categories["Salary"].id,
        accountId: bank.id,
        tags: "salary,income",
      },
    });

    // Seed July 2026 expenses (partial)
    for (const exp of expensesList.slice(0, 7)) {
      await db.transaction.create({
        data: {
          userId,
          date: new Date(2026, 6, 2),
          description: `Monthly ${exp.name} payment`,
          type: "Expense",
          amount: exp.amount,
          categoryId: categories[exp.name].id,
          accountId: bank.id,
          tags: "monthly,fixed",
        },
      });
    }

    // Seed Investments
    await db.investment.create({
      data: {
        userId,
        name: "Global Equities ETF",
        type: "Stocks",
        symbol: "IWDA.AS",
        quantity: 10,
        costBasis: 800.0,
        marketValue: 850.0,
        profit: 50.0,
        allocation: 2.1,
      },
    });

    await db.investment.create({
      data: {
        userId,
        name: "Bitcoin",
        type: "Bitcoin",
        symbol: "BTC",
        quantity: 0.016,
        costBasis: 900.0,
        marketValue: 1000.0,
        profit: 100.0,
        allocation: 2.5,
      },
    });

    await db.investment.create({
      data: {
        userId,
        name: "Ethereum & Solana Portfolio",
        type: "Other Crypto",
        symbol: "ETH/SOL",
        quantity: 1,
        costBasis: 1000.0,
        marketValue: 925.0,
        profit: -75.0,
        allocation: 2.3,
      },
    });

    await db.investment.create({
      data: {
        userId,
        name: "Trade Republic Uninvested Cash",
        type: "Trade Republic Cash",
        symbol: "CASH.TR",
        quantity: 35326.96,
        costBasis: 35326.96,
        marketValue: 35326.96,
        profit: 0.0,
        allocation: 88.0,
      },
    });

    // Seed Goals
    await db.goal.create({
      data: {
        userId,
        name: "IRS Reservation 2026",
        type: "IRS",
        targetAmount: 11000.0,
        currentAmount: 11000.0,
        progress: 100.0,
        estimatedCompletion: "Completed",
      },
    });

    await db.goal.create({
      data: {
        userId,
        name: "Emergency Fund",
        type: "Emergency Fund",
        targetAmount: 10000.0,
        currentAmount: 10000.0,
        progress: 100.0,
        estimatedCompletion: "Completed",
      },
    });

    const houseGoalRemaining = 35326.96 - 11000.0 - 10000.0;
    await db.goal.create({
      data: {
        userId,
        name: "House Down Payment",
        type: "House",
        targetAmount: 50000.0,
        currentAmount: houseGoalRemaining,
        progress: (houseGoalRemaining / 50000.0) * 100,
        estimatedCompletion: "Dec 2028",
      },
    });

    // Tax Reservation
    await db.taxReservation.create({
      data: {
        userId,
        year: 2026,
        estimatedTaxLiability: 11000.0,
        taxWithheld: 8500.0,
        notes: "Calculated based on average monthly income and Portuguese IRS rates.",
      },
    });

    // Asset Allocation
    const assetTypes = [
      { type: "Trade Republic Cash", target: 50, current: 87.5 },
      { type: "Stocks", target: 30, current: 2.1 },
      { type: "Bitcoin", target: 10, current: 2.5 },
      { type: "Other Crypto", target: 5, current: 2.3 },
      { type: "Bank Cash", target: 5, current: 5.6 },
    ];

    for (const asset of assetTypes) {
      await db.assetAllocation.create({
        data: {
          userId,
          assetType: asset.type,
          targetPercentage: asset.target,
          currentPercentage: asset.current,
        },
      });
    }

    // Monthly Snapshots
    const snapshots = [
      { year: 2026, month: 1, netWorth: 34000, liquidAssets: 32000, investmentsValue: 2000, savingsRate: 35 },
      { year: 2026, month: 2, netWorth: 35100, liquidAssets: 32800, investmentsValue: 2300, savingsRate: 40 },
      { year: 2026, month: 3, netWorth: 36500, liquidAssets: 34000, investmentsValue: 2500, savingsRate: 38 },
      { year: 2026, month: 4, netWorth: 37900, liquidAssets: 35200, investmentsValue: 2700, savingsRate: 45 },
      { year: 2026, month: 5, netWorth: 39500, liquidAssets: 36700, investmentsValue: 2800, savingsRate: 42 },
      { year: 2026, month: 6, netWorth: 40251.96, liquidAssets: 37476.96, investmentsValue: 2775, savingsRate: 44 },
    ];

    for (const snap of snapshots) {
      await db.monthlySnapshot.create({
        data: { ...snap, userId },
      });
    }

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/investments");
    revalidatePath("/goals");
    revalidatePath("/reports");
    revalidatePath("/settings");

    return { success: true };
  } catch (error: any) {
    console.error("Reset error:", error);
    throw new Error(error?.message || "Failed to reset and seed database");
  }
});

export const wipeUserData = authActionClient.action(async ({ ctx: { userId } }) => {
  try {
    await db.assetAllocation.deleteMany({ where: { userId } }).catch(() => {});
    await db.taxReservation.deleteMany({ where: { userId } }).catch(() => {});
    await db.budget.deleteMany({ where: { userId } }).catch(() => {});
    await db.monthlySnapshot.deleteMany({ where: { userId } }).catch(() => {});
    await db.goal.deleteMany({ where: { userId } }).catch(() => {});
    await db.investment.deleteMany({ where: { userId } }).catch(() => {});
    await db.transaction.deleteMany({ where: { userId } }).catch(() => {});
    await db.category.deleteMany({ where: { userId } }).catch(() => {});
    await db.account.deleteMany({ where: { userId } }).catch(() => {});

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/investments");
    revalidatePath("/goals");
    revalidatePath("/reports");
    revalidatePath("/settings");

    return { success: true };
  } catch (error: any) {
    console.error("Wipe error:", error);
    throw new Error(error?.message || "Failed to wipe user data");
  }
});
