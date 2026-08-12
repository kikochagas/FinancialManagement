const XLSX = require("xlsx");
const fs = require("fs");

// Dummy Transactions
const transactions = [
  { Date: "2026-08-01", Description: "Freelance Client A", Type: "Income", Amount: 1200.50, Account: "Millennium BCP", Category: "Side Hustle", Tags: "freelance, web", Notes: "August invoice" },
  { Date: "2026-08-03", Description: "Grocery Store", Type: "Expense", Amount: -154.20, Account: "Millennium BCP", Category: "Groceries", Tags: "food", Notes: "Weekly shopping" },
  { Date: "2026-08-05", Description: "Monthly Savings", Type: "Transfer", Amount: -300.00, Account: "Millennium BCP", Category: "Transfers", Tags: "savings", Notes: "" },
  { Date: "2026-08-05", Description: "Monthly Savings", Type: "Transfer", Amount: 300.00, Account: "Savings TR", Category: "Transfers", Tags: "savings", Notes: "" },
  { Date: "2026-08-06", Description: "Gym Membership", Type: "Expense", Amount: -35.00, Account: "Millennium BCP", Category: "Health", Tags: "fitness", Notes: "" },
];

// Dummy Accounts
const accounts = [
  { Name: "Millennium BCP", Type: "Bank", Balance: 2450.00 },
  { Name: "Savings TR", Type: "Trade Republic", Balance: 15300.50 },
  { Name: "Cash Wallet", Type: "Cash", Balance: 120.00 },
];

// Create workbook
const wb = XLSX.utils.book_new();

// Add sheets
const wsTransactions = XLSX.utils.json_to_sheet(transactions);
XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");

const wsAccounts = XLSX.utils.json_to_sheet(accounts);
XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

// Write file
XLSX.writeFile(wb, "dummy_financial_data.xlsx");
console.log("Created dummy_financial_data.xlsx successfully!");
