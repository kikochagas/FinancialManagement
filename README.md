<div align="center">
  <h1>✨ FinancialManagement Dashboard</h1>
  <p><strong>A unified personal finance and wealth management platform for the modern era.</strong></p>
</div>

<br />

FinancialManagement provides a comprehensive and consolidated view of your financial life. It goes beyond simple expense tracking by offering unified insights into your assets, cash flow, investments, and long-term financial goals - all wrapped in a beautiful, responsive interface.

---

## 🌟 What can I do with FinancialManagement?

### 🏦 Manage Your Wealth
- **Track all accounts in one place:** Manage bank accounts, credit cards, cash, and crypto wallets.
- **Sync with real banks:** Connect supported bank accounts securely via Open Banking (powered by Enable Banking) and sync balances and transactions from FinancialManagement.
- **Monitor Investments & Goals:** Track your stocks, crypto, and savings goals with automated progress calculations.
- **Broker Transaction Import:** Upload CSV activity statements from your brokers (e.g., Trade Republic). Our generic parser smartly maps columns, normalizes trading events (Buys, Sells, Dividends, Transfers), prevents duplicates, and safely updates your uninvested cash balances.
- **Visualize your Net Worth:** Watch your wealth grow over time with interactive charts and historical monthly snapshots.

### 💸 Master Your Cash Flow
- **Smart Categorization:** Organize your income and expenses using intuitive categories like *Salary, Groceries, Travel, and Investments*.
- **Internal Transfers:** Moving money from your Bank to your Broker? We handle it cleanly as a single transfer transaction, so your income and expenses aren't artificially inflated.
- **Bank Statement Import:** Upload Excel or CSV bank statements. Our intelligent parser automatically maps columns, detects duplicates, and suggests categories using deterministic transaction-description rules. (AI-assisted column mapping is also available!)
- **Printable Reports:** Generate instant PDF-ready vector wealth statements for your records or tax purposes.

---

## 🚀 How do I...? (User Journeys)

### Record an expense or income
1. Navigate to the **Transactions** page.
2. Click **Add Record**.
3. Set the Direction to **Debit** (expense) or **Credit** (income).
4. Enter the Amount, Description, and select a Category.

### Move money between accounts
1. On the **Transactions** page, click **Add Record**.
2. Set the Direction to **Internal Transfer**.
3. Select your Source Account and Destination Account.
4. The system will cleanly balance the books without inflating your spending.

### Import a Bank Statement
1. Go to **Reports** and click on **Bank Statement Import**.
2. Upload your bank's Excel or CSV file.
3. Review the column mapping (our AI can help if headers are confusing).
4. Review the parsed transactions, confirm the suggested categories, and click **Import**.

### Import a Broker Statement
1. Go to **Reports** and click on **Broker Transaction Import**.
2. Upload your broker's CSV file (e.g., Trade Republic).
3. Confirm the intelligent column mapping and event type normalization.
4. Review the derived uninvested cash balance and confirm the import.
5. Your activity is safely deduped and securely visible under **Investments > Activity**.

### Connect a Real Bank Account
1. Navigate to **Accounts**.
2. Click **Connect Bank**.
3. Select your institution from the list (via Enable Banking).
4. Authenticate securely with your bank's portal.
5. Your account balances and transactions can now be updated by clicking **Sync Bank**.

### Backup or Restore my data
1. Go to **Reports**.
2. Use the **Excel / CSV Data Operations** panel to download a full structured backup of your entire ecosystem.
3. You can restore this exact file later using the **FinancialManagement Structured Backup / Import** workflow.

---

## 📦 Backup & Restore

Use the **Excel / CSV Data Operations** panel to download a full structured backup of your entire ecosystem.

### Advanced: Structured Spreadsheet Format

XLSX / structured export is preferred for full backup/restore. Your structured Excel workbook can contain the following sheets:

**1. Accounts**
- Name
- Type
- Balance
- Currency

**2. Transactions**
- Date
- Description
- Direction (Must be: Debit, Credit, or InternalTransfer)
- Amount
- Account
- DestinationAccount (Required if InternalTransfer)
- Category
- Tags
- Notes

**3. Investments**
- Name
- Type
- CostBasis
- MarketValue

**4. Goals**
- Name
- Type
- TargetAmount
- CurrentAmount

**5. Snapshots**
- Year
- Month
- NetWorth / Net Worth
- LiquidAssets / Liquid Assets
- Investments / InvestmentsValue
- SavingsRate / Savings Rate

*Legacy V1 Compatibility: Type values such as Income/Expense/etc. are still supported for old files, but new backups strictly use the Direction model.*

---

## 🏗️ Architecture Overview

FinancialManagement is built on a modern, robust TypeScript stack:
- **Frontend & API:** Next.js (App Router, Server Actions), React, Tailwind CSS, shadcn/ui
- **Database (Local):** SQLite with Prisma ORM
- **Database (Production):** Turso / libSQL
- **Open Banking:** Enable Banking API

### Deployment vs Local Development

**💻 Local Development**
Designed for speed and simplicity. The app runs on your machine and stores all data in a local SQLite file (dev.db).

**☁️ Hosted Demo**
Deployed securely on Render, connecting to a remote Turso database and live Open Banking APIs.

---

## 🛠️ For Developers

Are you a developer looking to set up the project, run tests, or deploy to production? We have comprehensive guides for you:

- 🚀 **[Deployment Guide](docs/DEPLOYMENT.md)** - Learn how to deploy to Render and Turso.
- 🧪 **[Manual Test Guide](docs/MANUAL_TEST_GUIDE.md)** - Comprehensive regression flows for testing features.

**Quick Start (Local):**
```bash
# Install dependencies
npm install

# Initialize your local SQLite database
npx prisma generate
npx prisma db push

# Start the development server
npm run dev
```

*Note: Automated tests (Vitest) run strictly against a local `test.db` and are completely isolated from your production or development data.*
