# FinancialManagement

A modern, highly optimized, and intuitive personal finance application designed to help you track assets, accounts, investments, financial goals, cash flow, and generate comprehensive reports through a data-driven interface. Built with Next.js, Prisma, TailwindCSS, and Recharts.

---

## 🌟 Key Functionalities

### 📊 Dynamic Dashboard
Your financial cockpit. Features a series of dynamic cards that automatically adapt to your actual data:
- **Core Metrics:** Net Worth, Liquid Assets, Investments Portfolio, Monthly Income/Expenses, and Savings Rate.
- **Dynamic Cards:** Automatically surfaces your most important active Goals, outstanding IRS Tax Reservations, and your top savings/investment accounts.
- **Visual Analytics:** 
  - **Net Worth Evolution:** Area chart showing your historical financial progress.
  - **Asset Allocation:** Pie chart breaking down your wealth distribution.
  - **Expenses by Category:** Pie chart analyzing your monthly spending habits.
  - **Monthly Cash Flow:** Bar chart comparing Income vs. Expenses over the last 6 months.

### 🏦 Accounts & Transactions
Manage all your daily financial movements seamlessly.
- **Multi-Account Tracking:** Support for standard Bank accounts, Trade Republic, Coverflex, Cash, Crypto Wallets, and Brokers.
- **Open Banking Integration:** Securely connect your real-world bank accounts using the Enable Banking API (supporting European ASPSPs).
- **Automated Synchronization:** Automatically fetches initial balances and transaction histories upon linking, with one-click manual syncing thereafter.
- **Transactions:** Log Income, Expenses, Transfers, Investments, Interests, and Taxes.
- **Categorization & Tagging:** Keep things organized with customizable categories and searchable tags.
- **Full Control:** Easily disconnect or permanently delete bank-connected accounts and all associated data at any time.

### 📈 Investments Portfolio
Track your wealth building vehicles.
- Monitor Stocks, ETFs, Bitcoin, Ethereum, and other cryptocurrencies.
- Automatically calculates Cost Basis, Market Value, Profit, and relative Allocation.

### 🎯 Financial Goals & Tax Reservations
Plan for the future with precision.
- **Goals Tracking:** Set targets (e.g., Emergency Fund, House Down Payment) and let the app automatically calculate your progress percentage based on your current allocated amount.
- **Tax Reservation:** Specifically designed for freelancers or individuals who need to estimate outstanding tax liabilities (IRS) versus what has already been withheld.

---

## 📥 Importing Data via Excel

The application features a powerful drag-and-drop Excel importer found in the **Reports** section. You can upload an Excel (`.xlsx`) or CSV file containing your historical data to instantly populate the application.

### Required Excel Templates
For the importer to successfully map your data, your Excel file should contain specific sheets (or tabs) with the following headers in the first row. *(Note: Column names are flexible and support both English and Portuguese variations).*

#### 1. Transactions Sheet
Name the sheet: `Transactions` (or similar)
- **Date** (e.g., 2026-08-10)
- **Description** (e.g., Grocery Shopping)
- **Amount** / Valor (e.g., 150)
- **Type** / Tipo (e.g., Expense)
- **Category** / Categoria (e.g., Food)
- **Account** / Conta (e.g., Main Bank Account)
- **Tags** (e.g., essential, monthly)

#### 2. Accounts Sheet
Name the sheet: `Accounts` (or similar)
- **Name** / Account (e.g., Trade Republic)
- **Type** (e.g., Trade Republic Cash)
- **Balance** / Saldo (e.g., 15000)
- **Currency** / Moeda (e.g., EUR)

#### 3. Investments Sheet
Name the sheet: `Investments` (or similar)
- **Name** / Nome (e.g., Bitcoin)
- **Type** (e.g., Crypto)
- **CostBasis** / Cost Basis (e.g., 5000)
- **MarketValue** / Market Value (e.g., 6500)

#### 4. Goals Sheet
Name the sheet: `Goals` (or similar)
- **Name** / Objetivo (e.g., Emergency Fund)
- **Type** / Tipo (e.g., Emergency Fund)
- **TargetAmount** / Target (e.g., 10000)
- **CurrentAmount** / Current (e.g., 5000)
*(Note: Progress percentage is automatically calculated for you!)*

#### 5. Snapshots Sheet (Net Worth Evolution)
Name the sheet: `Snapshots` (or similar)
- **Year** / Ano (e.g., 2026)
- **Month** / Mês (e.g., 5)
- **NetWorth** / Net Worth (e.g., 34000)
- **LiquidAssets** / Liquid Assets (e.g., 32000)
- **Investments** / Investments Value (e.g., 2000)
- **SavingsRate** / Savings Rate (e.g., 35)

---

## 🔍 How to Check Information & Test

1. **Dashboard Overview:** Start by looking at the Dashboard. If a chart has no data, it will cleanly display a "No data" placeholder. As you add transactions or upload Excel snapshots, the charts will automatically adapt and calculate.
2. **Reviewing Transactions:** Head to the Transactions page to see a detailed table. Try editing a transaction—notice how modifying an amount or account updates your core metrics seamlessly.
3. **Validating Goals Progress:** Go to the Goals page. Edit a goal to change its `Current Amount`. The progress bar and percentage will dynamically calculate to reflect how close you are to your `Target Amount`.
4. **Validating Imports:** Before committing imported Excel data to the database, the Reports page will show you a beautiful visual preview table of exactly what was mapped from your file, categorized by sheet.

## 💻 Tech Stack
- Next.js (App Router, Server Actions)
- Prisma (SQLite)
- TailwindCSS & Lucide-React
- Recharts (Data Visualization)
- Vitest (Isolated test environment with separate SQLite database)
