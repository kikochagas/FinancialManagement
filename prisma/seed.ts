import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  // 1. Clean existing data
  await prisma.settings.deleteMany().catch(() => {});
  await prisma.assetAllocation.deleteMany().catch(() => {});
  await prisma.taxReservation.deleteMany().catch(() => {});
  await prisma.budget.deleteMany().catch(() => {});
  await prisma.monthlySnapshot.deleteMany().catch(() => {});
  await prisma.goal.deleteMany().catch(() => {});
  await prisma.investment.deleteMany().catch(() => {});
  await prisma.transaction.deleteMany().catch(() => {});
  await prisma.category.deleteMany().catch(() => {});
  await prisma.account.deleteMany().catch(() => {});

  
  // 1.5 Create User
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash: 'hashed',
      name: 'Demo User'
    }
  });

  // 2. Create Settings
  await prisma.settings.create({
    data: {
      userId: user.id,
      id: "global",
      theme: "Dark",
      currency: "EUR",
      language: "English",
    },
  });

  // 3. Create Accounts
  const bank = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Main Bank Account",
      type: "Bank",
      balance: 2000.0,
      currency: "EUR",
    },
  });

  const tr = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Trade Republic",
      type: "Trade Republic",
      balance: 35326.96,
      currency: "EUR",
    },
  });

  const coverflex1 = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Coverflex Meal",
      type: "Coverflex 1",
      balance: 0.0,
      currency: "EUR",
    },
  });

  const coverflex2 = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Coverflex Benefits",
      type: "Coverflex 2",
      balance: 0.0,
      currency: "EUR",
    },
  });

  const cash = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Physical Cash",
      type: "Cash",
      balance: 150.0,
      currency: "EUR",
    },
  });

  const cryptoWallet = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Hardware Wallet",
      type: "Crypto Wallet",
      balance: 1925.0, // Bitcoin 1000 + Other Crypto 925
      currency: "EUR",
    },
  });

  const broker = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Broker Account",
      type: "Broker",
      balance: 850.0, // Stocks
      currency: "EUR",
    },
  });

  console.log("Accounts seeded.");

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
    categories[cat.name] = await prisma.category.create({
      data: {
        userId: user.id,
        ...cat,
      },
    });
  }

  console.log("Categories seeded.");

  // 5. Create Monthly Expenses Transactions for June and July
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
    await prisma.transaction.create({
      data: {
      userId: user.id,
        date: new Date(2026, 5, 10), // June 10, 2026
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
  await prisma.transaction.create({
    data: {
      userId: user.id,
      date: new Date(2026, 5, 28), // June 28, 2026
      description: "Monthly Salary Deposit",
      type: "Income",
      amount: 4500.0,
      categoryId: categories["Salary"].id,
      accountId: bank.id,
      tags: "salary,income",
    },
  });

  // Seed July 2026 expenses (partial, up to current date)
  for (const exp of expensesList.slice(0, 7)) {
    await prisma.transaction.create({
      data: {
      userId: user.id,
        date: new Date(2026, 6, 2), // July 2, 2026
        description: `Monthly ${exp.name} payment`,
        type: "Expense",
        amount: exp.amount,
        categoryId: categories[exp.name].id,
        accountId: bank.id,
        tags: "monthly,fixed",
      },
    });
  }

  console.log("Transactions seeded.");

  // 6. Create Investments
  // Stocks = 850, Bitcoin = 1000, Other Crypto = 925
  const stocks = await prisma.investment.create({
    data: {
      userId: user.id,
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

  const btc = await prisma.investment.create({
    data: {
      userId: user.id,
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

  const otherCrypto = await prisma.investment.create({
    data: {
      userId: user.id,
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

  const trCash = await prisma.investment.create({
    data: {
      userId: user.id,
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

  console.log("Investments seeded.");

  // 7. Create Goals
  // IRS = 11000, Emergency Fund = 10000, House = Remaining Trade Republic balance
  const irsGoal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: "IRS Reservation 2026",
      type: "IRS",
      targetAmount: 11000.0,
      currentAmount: 11000.0,
      progress: 100.0,
      estimatedCompletion: "Completed",
    },
  });

  const efGoal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: "Emergency Fund",
      type: "Emergency Fund",
      targetAmount: 10000.0,
      currentAmount: 10000.0,
      progress: 100.0,
      estimatedCompletion: "Completed",
    },
  });

  const houseGoalRemaining = 35326.96 - 11000.0 - 10000.0; // 14326.96
  const houseGoal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: "House Down Payment",
      type: "House",
      targetAmount: 50000.0,
      currentAmount: houseGoalRemaining,
      progress: (houseGoalRemaining / 50000.0) * 100,
      estimatedCompletion: "Dec 2028",
    },
  });

  console.log("Goals seeded.");

  // 8. Tax Reservation
  await prisma.taxReservation.create({
    data: {
      userId: user.id,
      year: 2026,
      estimatedTaxLiability: 11000.0,
      taxWithheld: 8500.0,
      notes: "Calculated based on average monthly income and Portuguese IRS rates.",
    },
  });

  // 9. Asset Allocation
  const assetTypes = [
    { type: "Trade Republic Cash", target: 50, current: 87.5 },
    { type: "Stocks", target: 30, current: 2.1 },
    { type: "Bitcoin", target: 10, current: 2.5 },
    { type: "Other Crypto", target: 5, current: 2.3 },
    { type: "Bank Cash", target: 5, current: 5.6 },
  ];

  for (const asset of assetTypes) {
    await prisma.assetAllocation.create({
      data: {
      userId: user.id,
        assetType: asset.type,
        targetPercentage: asset.target,
        currentPercentage: asset.current,
      },
    });
  }

  // 10. Monthly Snapshots (last 6 months evolution)
  const snapshots = [
    { year: 2026, month: 1, netWorth: 34000, liquidAssets: 32000, investmentsValue: 2000, savingsRate: 35 },
    { year: 2026, month: 2, netWorth: 35100, liquidAssets: 32800, investmentsValue: 2300, savingsRate: 40 },
    { year: 2026, month: 3, netWorth: 36500, liquidAssets: 34000, investmentsValue: 2500, savingsRate: 38 },
    { year: 2026, month: 4, netWorth: 37900, liquidAssets: 35200, investmentsValue: 2700, savingsRate: 45 },
    { year: 2026, month: 5, netWorth: 39500, liquidAssets: 36700, investmentsValue: 2800, savingsRate: 42 },
    { year: 2026, month: 6, netWorth: 40251.96, liquidAssets: 37476.96, investmentsValue: 2775, savingsRate: 44 }, // Bank(2000) + TR(35326.96) + Cash(150) + Stocks(850) + BTC(1000) + OtherCrypto(925) = 40251.96
  ];

  for (const snap of snapshots) {
    await prisma.monthlySnapshot.create({
      data: {
        userId: user.id,
        ...snap,
      },
    });
  }

  console.log("Monthly snapshots seeded.");
  console.log("Seeding complete successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
