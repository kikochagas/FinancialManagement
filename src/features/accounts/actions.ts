"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";
import { internalSyncBalance, internalSyncTransactions } from "./services/sync";

const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Account Type is required"), // Bank, Trade Republic, Coverflex 1, Coverflex 2, Cash, Crypto Wallet, Broker
  balance: z.number().default(0),
  currency: z.string().default("EUR"),
});

const updateAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  balance: z.number().optional(),
  currency: z.string().optional(),
});

const deleteAccountSchema = z.object({
  id: z.string(),
});

export const createAccount = authActionClient
  .schema(createAccountSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const account = await db.account.create({
      data: { ...parsedInput, userId },
    });
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
    return { success: true, account };
  });

export const updateAccount = authActionClient
  .schema(updateAccountSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id, ...data } = parsedInput;
    // Verify ownership
    const existing = await db.account.findUnique({ where: { id }, include: { externalMappings: true } });
    if (!existing || existing.userId !== userId) throw new Error("Unauthorized");

    if (existing.externalMappings.length > 0) {
      if (data.balance !== undefined && data.balance !== existing.balance) {
         throw new Error("Cannot manually modify the balance of a bank-connected account.");
      }
      if (data.currency !== undefined && data.currency !== existing.currency) {
         throw new Error("Cannot manually modify the currency of a bank-connected account.");
      }
      if (data.type !== undefined && data.type !== existing.type) {
         throw new Error("Cannot manually modify the type of a bank-connected account.");
      }
    }

    const account = await db.account.update({
      where: { id },
      data,
    });
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
    return { success: true, account };
  });

export const deleteAccount = authActionClient
  .schema(deleteAccountSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const account = await db.account.findUnique({ 
      where: { id: parsedInput.id }
    });
    if (!account) throw new Error("Account not found");
    if (account.userId !== userId) throw new Error("Unauthorized");

    await db.account.delete({
      where: { id: parsedInput.id },
    });
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
    return { success: true };
  });

const linkAccountsSchema = z.object({
  connectionId: z.string(),
  selections: z.array(z.object({
    pendingAccountId: z.string(),
    action: z.enum(["CREATE", "LINK", "IGNORE"]),
    // For CREATE
    name: z.string().optional(),
    // For LINK
    existingAccountId: z.string().optional(),
    // For transaction history policy
    importHistory: z.boolean().default(false)
  }))
});

export const linkAccounts = authActionClient
  .schema(linkAccountsSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { connectionId, selections } = parsedInput;

    const result = await db.$transaction(async (tx) => {
      const connection = await tx.bankConnection.findUnique({
        where: { id: connectionId }
      });
      if (!connection || connection.userId !== userId) {
        throw new Error("Unauthorized connection");
      }

      const pendingAccounts = await tx.pendingExternalAccount.findMany({
        where: { bankConnectionId: connectionId }
      });

      let linkedAccountIds: string[] = [];
      for (const selection of selections) {
        if (selection.action === "IGNORE") {
          const existsInDb = pendingAccounts.some(a => a.id === selection.pendingAccountId);
          if (existsInDb) {
            await tx.pendingExternalAccount.delete({
              where: { id: selection.pendingAccountId }
            });
          }
          continue;
        }

        const pendingAcc = pendingAccounts.find((a) => a.id === selection.pendingAccountId);
        if (!pendingAcc) throw new Error("Invalid pending account");

        if (pendingAcc.expiresAt < new Date()) {
          throw new Error("Pending account expired");
        }

        let transactionImportFrom: Date | null = null;
        let accountIdToMap = "";

        if (selection.action === "CREATE") {
          transactionImportFrom = null; // Always null for new accounts
          
          // Map cashAccountType to an existing Account type
          let accountType = "Bank";
          if (pendingAcc.cashAccountType === "CACC") accountType = "Bank"; // Current Account
          else if (pendingAcc.cashAccountType === "SVGS") accountType = "Bank"; // Savings
          else if (pendingAcc.cashAccountType === "CARD") accountType = "Credit Card";
          else {
            throw new Error(`Unsupported account type: ${pendingAcc.cashAccountType || "Unknown"}`);
          }

          const newAccount = await tx.account.create({
            data: {
              userId,
              name: selection.name || pendingAcc.displayName,
              type: accountType,
              balance: 0, // Requirements: use neutral/default value, don't fetch balances here
              currency: pendingAcc.currency
            }
          });
          accountIdToMap = newAccount.id;

        } else if (selection.action === "LINK") {
          transactionImportFrom = selection.importHistory ? null : new Date(); // Use history setting for existing accounts

          if (!selection.existingAccountId) throw new Error("Existing account ID required");

          const existingAccount = await tx.account.findUnique({
            where: { id: selection.existingAccountId },
            include: { externalMappings: true }
          });

          if (!existingAccount || existingAccount.userId !== userId) {
            throw new Error("Invalid existing account");
          }
          
          if (existingAccount.currency !== pendingAcc.currency) {
             // Requirements: Do not silently change an existing Account's currency.
             // We'll throw an error. UI should prevent selecting this.
             throw new Error("Currency mismatch");
          }

          const hasOtherMapping = existingAccount.externalMappings.some(
             (m) => m.identificationHash !== pendingAcc.identificationHash
          );
          if (hasOtherMapping) {
            throw new Error("Account already linked to a different external identity");
          }

          accountIdToMap = existingAccount.id;
        }

        // Upsert the external mapping
        await tx.externalAccountMapping.upsert({
          where: {
            bankConnectionId_identificationHash: {
              bankConnectionId: connectionId,
              identificationHash: pendingAcc.identificationHash
            }
          },
          update: {
            providerAccountUid: pendingAcc.providerAccountUid,
            accountId: accountIdToMap, // In case they update it somehow? The UI prevents this but fine
            transactionImportFrom: transactionImportFrom
          },
          create: {
            bankConnectionId: connectionId,
            accountId: accountIdToMap,
            providerAccountUid: pendingAcc.providerAccountUid,
            identificationHash: pendingAcc.identificationHash,
            transactionImportFrom: transactionImportFrom
          }
        });

        // Delete the consumed pending record
        await tx.pendingExternalAccount.delete({
          where: { id: pendingAcc.id }
        });
        
        linkedAccountIds.push(accountIdToMap);
      }

      return { success: true, linkedAccountIds };
    });

    revalidatePath("/");
    revalidatePath("/accounts");
    return result;
  });

const syncBalanceSchema = z.object({
  accountId: z.string(),
});

export const syncBalance = authActionClient
  .schema(syncBalanceSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const res = await internalSyncBalance(parsedInput.accountId, userId);
    revalidatePath("/");
    revalidatePath("/accounts");
    return res;
  });

const syncTransactionsSchema = z.object({
  accountId: z.string(),
});

export const syncTransactions = authActionClient
  .schema(syncTransactionsSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const res = await internalSyncTransactions(parsedInput.accountId, userId);
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
    return res;
  });

export const syncBankAccount = authActionClient
  .schema(z.object({ accountId: z.string() }))
  .action(async ({ parsedInput: { accountId }, ctx: { userId } }) => {
    // 1. Sync Balance
    let balanceRes;
    try {
      balanceRes = await internalSyncBalance(accountId, userId);
    } catch (e: any) {
      return { success: false, partial: false, balanceUpdated: false, transactionsUpdated: false, error: e.message };
    }

    if (balanceRes.reauthRequired) {
      return balanceRes; // Return reauth immediately
    }

    // 2. Sync Transactions
    let txRes;
    try {
      txRes = await internalSyncTransactions(accountId, userId);
    } catch (e: any) {
      return { 
        success: false, 
        partial: true, 
        balanceUpdated: true, 
        transactionsUpdated: false, 
        error: e.message 
      };
    }

    if ("reauthRequired" in txRes && txRes.reauthRequired) {
      return txRes;
    }

    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");

    return {
      success: true,
      balanceUpdated: true,
      transactionsUpdated: true,
      imported: txRes.imported || 0,
      duplicates: txRes.duplicates || 0,
      skipped: (txRes.skippedInvalid || 0) + (txRes.skippedCurrencyMismatch || 0),
    };
  });

export const disconnectBank = authActionClient
  .schema(z.object({ accountId: z.string() }))
  .action(async ({ parsedInput: { accountId }, ctx: { userId } }) => {
    const account = await db.account.findUnique({
      where: { id: accountId },
      include: {
        externalMappings: {
          include: { bankConnection: true }
        }
      }
    });

    if (!account || account.userId !== userId) throw new Error("Unauthorized or invalid account");
    if (account.externalMappings.length === 0) throw new Error("Account is not connected to a bank");

    const mapping = account.externalMappings[0];
    const connection = mapping.bankConnection;

    if (connection.userId !== userId) throw new Error("Unauthorized connection");

    if (connection.providerSessionId && connection.status !== "REVOKED" && connection.status !== "EXPIRED") {
      const client = new EnableBankingClient();
      try {
        await client.revokeSession(connection.providerSessionId);
      } catch (e: any) {
        if (e.name === "EnableBankingProviderError") {
          const code = e.body?.error;
          // terminal states are safe to consider "revoked"
          if (code === "EXPIRED_SESSION" || code === "REVOKED_SESSION" || code === "CLOSED_SESSION" || code === "NOT_FOUND") {
            // Safe to proceed to local revocation
          } else {
            throw new Error(`Provider failed to revoke: ${code || e.message}`);
          }
        } else {
           throw new Error("Provider revocation failed due to a network/application error.");
        }
      }
    }

    await db.bankConnection.update({
      where: { id: connection.id },
      data: { status: "REVOKED" }
    });

    revalidatePath("/");
    revalidatePath("/accounts");
    
    return { success: true, institutionName: connection.institutionName };
  });
