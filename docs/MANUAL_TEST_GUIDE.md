# FinancialManagement Manual Testing Guide

## 1. Purpose
This guide provides step-by-step instructions for manually testing the FinancialManagement application exactly as a normal user would use it. It covers end-to-end regression testing across the entire application interface.

## 2. Before You Start
- FinancialManagement is available in the browser.
- You can log in with a test account.
- You have at least two FinancialManagement Accounts created for transfer tests.
- Enable Banking Sandbox / Mock ASPSP is available when testing bank connections.
- You have a representative Bank Statement Excel/CSV file available for import.
- Use test/demo data when performing destructive actions such as Reset Demo Data.

## 3. Quick Smoke Test
These core scenarios provide a rapid health check of the application.

- **SMOKE-01:** Login and Dashboard opens.
- **SMOKE-02:** Create Credit + Salary.
- **SMOKE-03:** Create Debit + Groceries.
- **SMOKE-04:** Create Internal Transfer from Account A to Account B.
- **SMOKE-05:** Verify transfer appears in both Account histories.
- **SMOKE-06:** Verify Account filter works from both sides.
- **SMOKE-07:** Verify Dashboard totals exclude Internal Transfer.
- **SMOKE-08:** Upload Bank Statement and reach Review.
- **SMOKE-09:** Verify automatic Category suggestions.
- **SMOKE-10:** Connect/sync Mock ASPSP.
- **SMOKE-11:** Export and restore FinancialManagement backup.
- **SMOKE-12:** Reset Demo Data and confirm application remains usable.

## 4. Login / General Navigation
### User Isolation
- **Steps:**
  1. Log in with a test account (User A).
  2. Log in with a separate test account (User B) in another browser/incognito window.
- **Expected Result:** User A's data (Accounts, Transactions, Categories) is completely independent and not visible to User B, and vice versa.

## 5. Accounts
### Create and Manage Accounts
- **Steps:**
  1. Navigate to "Accounts".
  2. Click the button to add a new account.
  3. Fill in details (e.g., Name: "Main Bank Account", Balance: "2000").
  4. Save the account.
  5. Repeat to create "Trade Republic" with a balance of "36000".
- **Expected Result:** Accounts are created successfully and appear on the Accounts page with correct balances.

## 6. Categories
### Category Selection
- **Steps:**
  1. Navigate to "Transactions" and click "Add Record".
  2. Open the Category dropdown.
- **Expected Result:** Default categories (e.g., Salary, Purchase, Transfer, Interest, Tax, Fees) appear.

## 7. Credit Transactions
### Create Credit
- **Steps:**
  1. Go to "Transactions" and click "Add Record".
  2. Select Direction: Credit.
  3. Select Category: Salary.
  4. Enter Amount: 1000.
  5. Save.
- **Expected Result:** The Account balance increases by 1000. The transaction displays with a `+` sign. Dashboard Income increases by 1000. Dashboard Expenses remain unchanged.

## 8. Debit Transactions
### Create Debit
- **Steps:**
  1. Go to "Transactions" and click "Add Record".
  2. Select Direction: Debit.
  3. Select Category: Groceries.
  4. Enter Amount: 200.
  5. Save.
- **Expected Result:** The Account balance decreases by 200. The transaction displays with a `-` sign. Dashboard Expenses increase by 200. Dashboard Income remains unchanged.

## 9. Internal Transfers
### Create Transfer
- **Preconditions:** Main Account has €2,000, Trade Republic has €36,000.
- **Steps:**
  1. Go to "Transactions" and click "Add Record".
  2. Select Direction: Internal Transfer.
  3. Select Main Account as "From Account".
  4. Select Trade Republic as "To Account".
  5. Enter 200.
  6. Save.
- **Expected Result:** Main Account becomes €1,800. Trade Republic becomes €36,200. The Transactions list shows one Internal Transfer. Dashboard Income and Expenses remain unchanged.

### Edit Transfer
- **Preconditions:** A transfer of €100 exists from A to B (A: €900, B: €600).
- **Steps:**
  1. Edit the transfer amount to €200 and save.
- **Expected Result:** Account A balance becomes €800, Account B becomes €700.
- **Steps:**
  2. Edit the transfer destination from B to C.
- **Expected Result:** B returns to its pre-transfer balance. C receives €200. Account A reflects one €200 outgoing transfer.

### Delete Transfer
- **Steps:**
  1. Delete the transfer from A to B normally through the UI.
- **Expected Result:** Both Account balances return to their original values from before the transfer. The transfer disappears from Transactions and from both Account activities.

## 10. Account History / Transfer Perspectives
### Internal Transfer Visibility
- **Steps:**
  1. Go to Accounts.
  2. Click on Account A to view its recent activity.
  3. Click on Account B to view its recent activity.
- **Expected Result:** Account A shows the transfer as outgoing (-€200) to Account B. Account B shows the transfer as incoming (+€200) from Account A.

## 11. Transaction Filters
### Account Filter
- **Steps:**
  1. Go to "Transactions".
  2. Use the Account filter to select "All Accounts".
- **Expected Result:** The transfer appears once in the global list.
- **Steps:**
  3. Change the filter to "Main Account".
- **Expected Result:** The transfer appears as outgoing.
- **Steps:**
  4. Change the filter to "Trade Republic".
- **Expected Result:** The transfer appears as incoming.

### Direction Filter
- **Steps:**
  1. In Transactions, select "Trade Republic" in the Account filter.
  2. Change Direction filter to "Internal Transfer".
- **Expected Result:** The transfer remains visible.
- **Steps:**
  3. Change Direction filter to "Credit".
- **Expected Result:** The Internal Transfer disappears because it is not a Credit.

## 12. Dashboard
### Totals and Charts
- **Preconditions:** You have a Credit Salary of €1,000, Debit Groceries of €200, and an Internal Transfer of €500.
- **Steps:**
  1. Navigate to the Dashboard.
- **Expected Result:** Income displays as €1,000. Expenses display as €200. The Internal Transfer does not increase either total. Recent activity and charts reflect these amounts correctly.

## 13. Bank Statement Import
### File Upload and Review
- **Steps:**
  1. Go to "Reports".
  2. Upload a representative Bank Statement file.
  3. Proceed through Mapping and Account Selection.
  4. Reach the Review screen.
- **Expected Result:** Dates, amounts, currencies, and Debit/Credit indicators are correctly detected. The application identifies columns properly and displays mapped rows.

### Update Account Balance Option
- **Steps:**
  1. Import a statement with "Update Account Balance" set to OFF.
- **Expected Result:** Account balance stays unchanged.
- **Steps:**
  2. Import a statement with "Update Account Balance" set to ON.
- **Expected Result:** Account balance becomes the statement ending balance shown in the workflow. Check via the Accounts page.

### Duplicate Detection
- **Steps:**
  1. Import a statement successfully.
  2. Start a new Bank Statement Import and upload the same file again.
- **Expected Result:** Previously imported transactions are flagged as probable duplicates in the Review screen.

### Invalid File Validation
- **Steps:**
  1. Upload a file with missing dates, blank rows, mixed currencies, or footer rows.
- **Expected Result:** The application safely blocks progress or shows a review warning, ignoring invalid rows.

## 14. Bank Statement Category Suggestions
### Automatic Categorization
- **Steps:**
  1. During a Bank Statement Import Review, check the suggested Categories for specific descriptions.
- **Expected Result:**
  - "Salary description" suggests Salary.
  - "ATM" or "levantamento" suggests Withdrawal.
  - "SEPA" or "transferência" suggests Transfer.
  - "Commission" or "fee" suggests Fees.
  - "IRS" or "imposto" suggests Tax.
  - "Juros" or "interest" suggests Interest.
  - "Investment" or "broker" suggests Investment.
  - "Compra" or "card payment" suggests Purchase.
  - Unknown descriptions suggest Uncategorized.

### False Positive Prevention
- **Steps:**
  1. Check the suggestions for edge case descriptions.
- **Expected Result:**
  - "Coffee Shop" -> NOT Fees (despite "fee" appearing in "coffee").
  - "Taxi Ride" -> NOT Tax.
  - "First Payment" -> NOT Tax.
  - "Account Fee" -> Fees.
  - "IRS Payment" -> Tax.

## 15. Open Banking
### Connect and Sync
- **Steps:**
  1. Go to "Accounts" and click "Connect Bank".
  2. Select the Mock ASPSP.
  3. Complete provider authorization and return to FinancialManagement.
  4. Link or create an account.
- **Expected Result:** The account balance matches the provider test account. Incoming transactions show as Credit, outgoing as Debit. Dates and amounts are correct. Syncing again does not create duplicate transactions.

### Disconnect and Reconnect
- **Steps:**
  1. Connect two accounts (if possible).
  2. Disconnect one account.
- **Expected Result:** The selected account is disconnected, but the other remains connected. Transaction history is preserved. The disconnected account becomes manually editable.
- **Steps:**
  3. Reconnect via the UI.
- **Expected Result:** Reconnection works smoothly without breaking sibling accounts.

### Delete Rules
- **Steps:**
  1. Attempt to delete an active connected bank account.
- **Expected Result:** Delete is unavailable or blocked.
- **Steps:**
  2. Disconnect the account, then attempt to delete it.
- **Expected Result:** Delete is available (if allowed by the UI).

## 16. Backup / Restore
### Full V2 Export and Import
- **Steps:**
  1. Ensure you have test Accounts, transactions (including an Internal Transfer), Investments, and Goals.
  2. Go to "Reports" and export a backup.
  3. Note the exact balances of your accounts.
  4. Use the Import feature to restore the downloaded backup.
- **Expected Result:** All accounts, transactions, investments, and goals are restored. Balances match exactly the values at export time. Internal Transfer source and destination relationships are preserved.

## 17. Settings Reset
### Reset Demo Data
- **Steps:**
  1. Go to "Settings".
  2. Locate and click "Reset Demo Data" (or "Reset & Seed Database").
  3. Confirm the prompt.
- **Expected Result:** The application returns to a demo state. Example Accounts, transactions, and categories appear normally. The Dashboard loads successfully. Creating Debit/Credit/Internal Transfer continues working, and no duplicate Categories are visible.

## 18. Optional Legacy Backup Test
*(Optional — requires an existing legacy backup file)*
- **Steps:**
  1. Upload a known old-format backup (Legacy V1) through the Reports import UI.
- **Expected Result:** The application imports it successfully and transactions appear converted to the current Direction/Category model.

## 19. Test Result Template
Use this reusable test report table to track manual testing:

| ID | Feature | Scenario | Expected Result | Actual Result | Pass/Fail | Notes |
|----|---------|----------|-----------------|---------------|-----------|-------|
| SMOKE-01 | Auth | Login and Dashboard loads | Loads correctly | | | |
| SMOKE-02 | Transac | Create Credit + Salary | +1000 Income | | | |
| SMOKE-03 | Transac | Create Debit + Groceries | -200 Expenses | | | |
| SMOKE-04 | Transac | Create Internal Transfer A->B | A-200, B+200 | | | |
| SMOKE-05 | Accounts| Verify transfer in both histories | Visible | | | |
| SMOKE-06 | Filter | Account filter works both sides | Filter accurate | | | |
| SMOKE-07 | Dash | Dashboard excludes Transfer | Excluded | | | |
| SMOKE-08 | Import | Upload statement to Review | Reaches Review | | | |
| SMOKE-09 | Import | Automatic Category suggestions | Correct mapped | | | |
| SMOKE-10 | OpenBank| Connect/sync Mock ASPSP | Matches ASPSP | | | |
| SMOKE-11 | Backup | V2 Export and Restore | Restores exactly | | | |
| SMOKE-12 | Settings| Reset Demo Data | App usable, demo data | | | |
