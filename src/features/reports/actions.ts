"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const importDataSchema = z.object({
  importMode: z.enum(["FullBackup", "TransactionsOnly"]).default("TransactionsOnly"),
  transactions: z.array(z.object({
    date: z.string(),
    description: z.string(),
    direction: z.enum(["Credit", "Debit", "InternalTransfer"]),
    amount: z.number(),
    accountName: z.string(),
    destinationAccountName: z.string().optional().nullable(),
    categoryName: z.string().optional().nullable(),
    tags: z.string().default(""),
    notes: z.string().optional().nullable(),
  })).optional(),
  accounts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    balance: z.number(),
    currency: z.string().default("EUR"),
  })).optional(),
  investments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    costBasis: z.number(),
    marketValue: z.number(),
  })).optional(),
  goals: z.array(z.object({
    name: z.string(),
    type: z.string(),
    targetAmount: z.number(),
    currentAmount: z.number(),
  })).optional(),
  snapshots: z.array(z.object({
    year: z.number(),
    month: z.number(),
    netWorth: z.number(),
    liquidAssets: z.number(),
    investmentsValue: z.number(),
    savingsRate: z.number(),
  })).optional(),
});

export const importDataAction = authActionClient
  .schema(importDataSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { importMode, transactions, accounts, investments, goals, snapshots } = parsedInput;

    await db.$transaction(async (txDb) => {
      // 1. Process Accounts
      if (accounts && accounts.length > 0) {
        for (const acc of accounts) {
          const existing = await txDb.account.findFirst({ where: { userId, name: acc.name } });
          if (existing) {
            await txDb.account.update({
              where: { id: existing.id },
              data: { balance: acc.balance, type: acc.type, currency: acc.currency },
            });
          } else {
            await txDb.account.create({
              data: {
                userId,
                name: acc.name,
                type: acc.type,
                balance: acc.balance,
                currency: acc.currency,
              },
            });
          }
        }
      }

      // 2. Process Transactions
      if (transactions && transactions.length > 0) {
        const dbAccounts = await txDb.account.findMany({ where: { userId } });
        const dbCategories = await txDb.category.findMany({ where: { userId } });

        for (const tx of transactions) {
          // Enforce invariants
          if (tx.direction === "Debit" || tx.direction === "Credit") {
            if (tx.destinationAccountName) {
              throw new Error(`Destination account must not be supplied for ${tx.direction}`);
            }
          }
          if (tx.direction === "InternalTransfer") {
            if (!tx.accountName || !tx.destinationAccountName) {
              throw new Error("Source and destination required for InternalTransfer");
            }
            if (tx.accountName.toLowerCase() === tx.destinationAccountName.toLowerCase()) {
              throw new Error("Source and destination accounts cannot be the same");
            }
          }

          // Find or create account
          let account = dbAccounts.find((a) => a.name.toLowerCase() === tx.accountName.toLowerCase());
          if (!account) {
            account = await txDb.account.create({
              data: {
                userId,
                name: tx.accountName,
                type: "Bank",
                balance: 0,
              },
            });
            dbAccounts.push(account);
          }

          // Find or create category
          let categoryId: string | null = null;
          if (tx.categoryName) {
            let category = dbCategories.find((c) => c.name.toLowerCase() === tx.categoryName!.toLowerCase());
            if (!category) {
              category = await txDb.category.create({
                data: {
                  userId,
                  name: tx.categoryName,
                  color: "#94a3b8",
                },
              });
              dbCategories.push(category);
            }
            categoryId = category.id;
          }

          const txDate = new Date(tx.date);

          let destAccount: any = null;
          if (tx.direction === "InternalTransfer" && tx.destinationAccountName) {
            destAccount = dbAccounts.find((a) => a.name.toLowerCase() === tx.destinationAccountName!.toLowerCase());
            if (!destAccount) {
              destAccount = await txDb.account.create({
                data: {
                  userId,
                  name: tx.destinationAccountName,
                  type: "Bank",
                  balance: 0,
                },
              });
              dbAccounts.push(destAccount);
            }
          }

          // Check for duplicate transaction
          const existingTx = await txDb.transaction.findFirst({
            where: {
              userId,
              date: txDate,
              description: tx.description,
              direction: tx.direction,
              amount: tx.amount,
              accountId: account.id,
              destinationAccountId: destAccount ? destAccount.id : null,
            },
          });

          if (existingTx) {
            continue; // Skip this duplicate record
          }

          await txDb.transaction.create({
            data: {
              userId,
              date: txDate,
              description: tx.description,
              direction: tx.direction,
              amount: tx.amount,
              accountId: account.id,
              destinationAccountId: destAccount ? destAccount.id : null,
              categoryId,
              tags: tx.tags || "",
              notes: tx.notes || null,
            },
          });

          // Adjust account balance accordingly only if TransactionsOnly mode
          if (importMode === "TransactionsOnly") {
            if (tx.direction === "Credit") {
              await txDb.account.update({
                where: { id: account.id },
                data: { balance: { increment: tx.amount } },
              });
            } else if (tx.direction === "Debit") {
              await txDb.account.update({
                where: { id: account.id },
                data: { balance: { decrement: tx.amount } },
              });
            } else if (tx.direction === "InternalTransfer") {
              await txDb.account.update({
                where: { id: account.id },
                data: { balance: { decrement: tx.amount } },
              });
              if (destAccount) {
                await txDb.account.update({
                  where: { id: destAccount.id },
                  data: { balance: { increment: tx.amount } },
                });
              }
            }
          }
        }
      }

      // 3. Process Investments
      if (investments && investments.length > 0) {
        for (const inv of investments) {
          const existing = await txDb.investment.findFirst({ where: { userId, name: inv.name } });
          const profit = inv.marketValue - inv.costBasis;
          if (existing) {
            await txDb.investment.update({
              where: { id: existing.id },
              data: {
                type: inv.type,
                costBasis: inv.costBasis,
                marketValue: inv.marketValue,
                profit,
              }
            });
          } else {
            await txDb.investment.create({
              data: {
                userId,
                name: inv.name,
                type: inv.type,
                costBasis: inv.costBasis,
                marketValue: inv.marketValue,
                profit,
                allocation: 0
              }
            });
          }
        }
        // Recompute allocations
        const allInvestments = await txDb.investment.findMany({ where: { userId } });
        const totalMarketValue = allInvestments.reduce((sum, inv) => sum + inv.marketValue, 0);
        for (const inv of allInvestments) {
          let newAllocation = totalMarketValue > 0 ? (inv.marketValue / totalMarketValue) * 100 : 0;
          await txDb.investment.update({
            where: { id: inv.id },
            data: { allocation: newAllocation },
          });
        }
      }

      // 4. Process Goals
      if (goals && goals.length > 0) {
        for (const goal of goals) {
          const existing = await txDb.goal.findFirst({ where: { userId, name: goal.name } });
          const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
          if (existing) {
            await txDb.goal.update({
              where: { id: existing.id },
              data: {
                type: goal.type,
                targetAmount: goal.targetAmount,
                currentAmount: goal.currentAmount,
                progress,
              }
            });
          } else {
            await txDb.goal.create({
              data: {
                userId,
                name: goal.name,
                type: goal.type,
                targetAmount: goal.targetAmount,
                currentAmount: goal.currentAmount,
                progress,
              }
            });
          }
        }
      }
      // 5. Process Snapshots
      if (snapshots && snapshots.length > 0) {
        for (const snap of snapshots) {
          const existing = await txDb.monthlySnapshot.findFirst({ 
            where: { userId, year: snap.year, month: snap.month } 
          });
          
          if (existing) {
            await txDb.monthlySnapshot.update({
              where: { id: existing.id },
              data: {
                netWorth: snap.netWorth,
                liquidAssets: snap.liquidAssets,
                investmentsValue: snap.investmentsValue,
                savingsRate: snap.savingsRate,
              }
            });
          } else {
            await txDb.monthlySnapshot.create({
              data: {
                userId,
                year: snap.year,
                month: snap.month,
                netWorth: snap.netWorth,
                liquidAssets: snap.liquidAssets,
                investmentsValue: snap.investmentsValue,
                savingsRate: snap.savingsRate,
              }
            });
          }
        }
      }
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/investments");
    revalidatePath("/goals");
    revalidatePath("/reports");
    return { success: true };
  });
