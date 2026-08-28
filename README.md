# FinancialManagement

FinancialManagement is a modern personal finance and wealth-management platform designed to provide a comprehensive and consolidated view of your financial life. It goes beyond simple expense tracking by offering unified insights into your assets, cash flow, investments, and long-term financial goals.

The platform provides a consolidated view of:
- **Accounts**
- **Transactions**
- **Income / Expenses**
- **Internal Transfers**
- **Investments**
- **Goals**
- **Dashboard / Net Worth**
- **Bank Statement Importing**
- **Open Banking Integrations**
- **Reports / Backup & Restore**

---

## Current Tech Stack

The application is built using a modern, robust TypeScript ecosystem:
- **Next.js** (App Router, Server Actions)
- **React**
- **TypeScript**
- **Prisma** (ORM)
- **SQLite** (for local development `dev.db`)
- **Turso / libSQL** (for the hosted remote database)
- **Tailwind CSS** (for styling)
- **TanStack** (Query and Table libraries)
- **Zod** (for schema validation)
- **Vitest** (for automated testing)
- **Enable Banking** (for Open Banking synchronization)
- **OpenAI API** (Optional, for AI-assisted bank statement column mapping)

---

## Architecture Overview

FinancialManagement is designed to work seamlessly both on a local machine and in a hosted deployment.

### Local Development
Locally, the application runs directly on your machine and uses a local SQLite file (`dev.db`).

```text
FinancialManagement
        |
        v
      Prisma
        |
        v
  SQLite dev.db
```

### Hosted Demo
In the deployed environment, the application is hosted on Render, pointing to a secure Turso database. The deployed environment does NOT depend on Render's local filesystem.

```text
       Browser
          |
          v
       Render
 (Next.js Application)
          |
          +------> Turso / libSQL (Remote Database)
          |
          +------> Enable Banking (Open Banking Provider)
          |
          +------> OpenAI API (Optional Column Mapping)
```

---

## Transaction Model

The application uses a strict Direction-based transaction model:
- **Debit:** Money leaves an account.
- **Credit:** Money enters an account.
- **Internal Transfer:** Money moves between two FinancialManagement accounts.

Transactions are organized using a **Category** to represent the purpose of the movement (e.g., *Salary, Purchase, Withdrawal, Transfer, Investment, Interest, Tax, Fees, Groceries, Travel, Entertainment, Uncategorized*).

**Important:** The Category does NOT determine balance behavior or cash flow semantics. Only the **Direction** determines if money is entering, leaving, or moving within your ecosystem.

---

## Internal Transfers

An Internal Transfer is correctly represented and stored as **ONE single database Transaction**. 

For example, a €200 transfer from your Main Account to Trade Republic has a source account and a destination account.
This exact same event:
- Appears as an outgoing movement in the Main Account history.
- Appears as an incoming movement in the Trade Republic history.
- Appears only once in the global Transactions ledger.
- Is strictly excluded from global Income and Expense calculations so your cash flow is not artificially inflated.

---

## Accounts

FinancialManagement tracks both manual Accounts and bank-connected Accounts. 
You can view balances, filter recent transactions, and manage connected Open Banking lifecycles (linking, syncing, or disconnecting).
Actively connected Open Banking Accounts have provider-controlled financial data, ensuring that your system remains mathematically synchronized with your real bank.

---

## Bank Statement Import

For manual accounts or historical data, the application includes a robust Bank Statement Import workflow supporting **XLSX**, **XLS**, and **CSV** files.

**Workflow:** Upload -> Mapping -> Account -> Review -> Import

The importer features:
- Intelligent header detection
- Strict date and money parsing
- Debit / Credit semantic detection
- Currency validation
- Duplicate detection
- Deterministic Category suggestions
- Manual review before committing imports
- Optional ending-balance updates
- Active Open Banking Accounts are protected from manual statement import conflicts where appropriate.

---

## AI-Assisted Mapping

The bank statement importer uses deterministic, rule-based mapping by default. If column semantics are highly ambiguous, you can optionally utilize the OpenAI API to help correctly identify columns.

**Privacy Boundary:** 
- AI is strictly used for *column semantic mapping*.
- Raw financial transaction values are **never** sent to OpenAI.
- Transaction categorization exclusively uses local deterministic rules, not AI.

The `OPENAI_API_KEY` is completely optional. Without it, the importer seamlessly falls back to standard deterministic or manual column mapping.

---

## Category Suggestions

During bank statement imports, FinancialManagement applies deterministic rules to suggest transaction categories.
Examples:
- `salary` / `payroll` -> **Salary**
- `ATM` / `withdrawal` -> **Withdrawal**
- `transfer` / `SEPA` -> **Transfer**
- `fee` / `commission` -> **Fees**
- `IRS` / `tax` -> **Tax**
- `interest` / `juros` -> **Interest**
- `investment` / `broker` -> **Investment**
- `purchase` / `card payment` -> **Purchase**
- unknown -> **Uncategorized**

---

## Open Banking

Open Banking is integrated using **Enable Banking**. 

**Normal Workflow:** Accounts -> Connect Bank -> Select Institution -> Provider Authorization -> Return to FinancialManagement -> Link/Create Account -> Sync.

Features include:
- Balance and transaction synchronization
- Duplicate protection
- Disconnect / Reconnect capability
- Shared-session / account-level lifecycle support

Provider transactions normalize strictly to **Credit** (incoming) or **Debit** (outgoing). Open Banking syncing does NOT automatically infer or create Internal Transfers to avoid erroneous assumptions.

---

## Backup / Restore

FinancialManagement supports a structured **V2 Backup** system. 
You can Export a full snapshot of your data and Import it later to perfectly restore your setup. 
It preserves:
- Accounts and balances
- Transactions (including Internal Transfer source/destination mapping)
- Categories
- Investments
- Goals

**Important:** Full backup restoration safely preserves your snapshot Account balances and does not attempt to replay historical transactions on top of them, preventing doubled balances.
*(Legacy V1 import functionality is also supported for backward compatibility).*

---

## Dashboard / Reporting

The Dashboard provides visual analytics and reporting tools.
Key metrics include:
- **Net Worth** (Evolution area chart)
- **Income** & **Expenses** (Cash flow bar chart)
- **Savings**
- **Category Breakdowns** (Expense pie chart)
- **Investments & Goals**

As noted, Internal Transfers perfectly reconcile and do not inflate Income or Expenses.

---

## Local Development

Setting up FinancialManagement locally strictly relies on local SQLite for ease of use. 

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure your local environment (`.env`)
4. Generate Prisma client and initialize your local database: `npx prisma generate` and `npx prisma db push`
5. Start the development server: `npm run dev`

*Do not use or configure Turso for normal local development. The local database remains standard SQLite (`dev.db`).*

---

## Environment Variables

Configure these variables via `.env` files locally or in your deployment dashboard. **Never commit real values or PEM files.**

**LOCAL / CORE**
- `DATABASE_URL`
- `JWT_SECRET`

**OPEN BANKING**
- `ENABLE_BANKING_APPLICATION_ID`
- `ENABLE_BANKING_PRIVATE_KEY_PATH` *(convenient locally)*
- `ENABLE_BANKING_PRIVATE_KEY` *(suitable for hosted environments)*
- `APP_URL`

**TURSO / HOSTED**
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN` *(Only needed for hosted/remote DB usage)*

**OPTIONAL AI**
- `OPENAI_API_KEY` *(Optional)*
- `OPENAI_MODEL` *(Optional)*

---

## Deployment

FinancialManagement's hosted architecture runs on **Render** (for the web application) and **Turso** (for the remote database).

For complete deployment instructions, including Turso bootstrap commands, Render configuration, and Enable Banking callback setups, refer exactly to:
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## Security / Data Safety

- **Secrets:** Handled entirely via environment variables. `.env` and PEM files are Git-ignored and must never be committed.
- **Local Data:** Your local `dev.db` contains private financial data and must not be deployed. The deployed database starts entirely independently in Turso.
- **Authentication:** `JWT_SECRET` is strictly enforced in production. 
- **Test Isolation:** Automated Vitest tests are hard-isolated to the local `test.db` and must never connect to Turso.

---

## Testing

**Automated Testing**
The repository uses Vitest and contains a robust test suite (~193 automated tests).

**Manual Testing**
Refer to **[docs/MANUAL_TEST_GUIDE.md](docs/MANUAL_TEST_GUIDE.md)**. 
It covers normal-user regression flows encompassing Accounts, Transactions, Internal Transfers, Dashboards, Bank Statement Imports, Open Banking, Backup/Restore, and Settings.

---

## Current Status

FinancialManagement is currently intended as a functional demo and testing environment. 
- Core personal finance functionality is fully implemented.
- Open Banking integration is live.
- Intelligent Bank Statement Importing is operational.
- The remote Render + Turso deployment architecture is actively tested and robust.
- The platform features extensive automated and manual regression coverage.

---

## Future Roadmap

Potential future features include:
- Brokerage aggregation / `BrokerageProvider` infrastructure
- Multi-broker integration
- Investment position and transaction synchronization
- Broker deposit / Internal Transfer reconciliation
- Expanded analytics and further AI assistance
