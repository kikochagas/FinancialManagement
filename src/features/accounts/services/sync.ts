import { db } from "@/lib/db";
import { EnableBankingClient } from "@/lib/banking/enable-banking-client";

export async function internalSyncBalance(accountId: string, userId: string) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: {
      externalMappings: {
        include: { bankConnection: true }
      }
    }
  });

  if (!account || account.userId !== userId) {
    throw new Error("Unauthorized or invalid account");
  }

  const mapping = account.externalMappings.find(m => m.disconnectedAt === null);
  if (!mapping) {
    throw new Error("Account is not linked to any external provider");
  }

  const connection = mapping.bankConnection;

  if (connection.status !== "CONNECTED" || !connection.providerSessionId) {
    return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
  }

  const client = new EnableBankingClient();

  try {
    const balances = await client.getBalances(mapping.providerAccountUid);
    const normalizedBalance = client.normalizeBalance(balances);

    if (!normalizedBalance) {
      throw new Error("No supported balance type available");
    }

    if (normalizedBalance.currency !== account.currency) {
      throw new Error("Currency mismatch between provider and account");
    }

    await db.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: normalizedBalance.amount }
      });

      await tx.externalAccountMapping.update({
        where: { id: mapping.id },
        data: { lastBalanceSyncedAt: new Date() }
      });
    });

    return { success: true };
  } catch (e: any) {
    if (e.name === "EnableBankingProviderError") {
       const code = e.body?.error;
       if (code === "EXPIRED_SESSION") {
         await db.bankConnection.update({
           where: { id: connection.id },
           data: { status: "EXPIRED" }
         });
         return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
       } else if (code === "REVOKED_SESSION" || code === "CLOSED_SESSION") {
         await db.bankConnection.update({
           where: { id: connection.id },
           data: { status: "REVOKED" }
         });
         return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
       }
    }
    
    if (e.message === "No supported balance type available" || e.message === "Currency mismatch between provider and account") {
      throw e;
    }
    throw new Error("Provider synchronization failed");
  }
}

export async function internalSyncTransactions(accountId: string, userId: string) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: {
      externalMappings: {
        include: { bankConnection: true }
      }
    }
  });

  if (!account || account.userId !== userId) {
    throw new Error("Unauthorized or invalid account");
  }

  const mapping = account.externalMappings.find(m => m.disconnectedAt === null);
  if (!mapping) {
    throw new Error("Account is not linked to any external provider");
  }

  const connection = mapping.bankConnection;

  if (connection.status !== "CONNECTED" || !mapping.providerAccountUid) {
    return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
  }

  const client = new EnableBankingClient();

  let continuationKey: string | undefined = undefined;
  let pagesFetched = 0;
  let fetched = 0;
  let imported = 0;
  let duplicates = 0;
  let skippedCurrencyMismatch = 0;
  let skippedInvalid = 0;

  let strategy: "longest" | "default" = "default";
  let dateFrom: string | undefined = undefined;

  if (!mapping.transactionImportFrom && !mapping.lastTransactionSyncedAt) {
    strategy = "longest";
    dateFrom = undefined;
  } else if (mapping.transactionImportFrom && !mapping.lastTransactionSyncedAt) {
    strategy = "default";
    dateFrom = mapping.transactionImportFrom.toISOString().split("T")[0];
  } else if (mapping.lastTransactionSyncedAt) {
    strategy = "default";
    const overlapDate = new Date(mapping.lastTransactionSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    let startDate = overlapDate;
    if (mapping.transactionImportFrom && startDate < mapping.transactionImportFrom) {
       startDate = mapping.transactionImportFrom;
    }
    dateFrom = startDate.toISOString().split("T")[0];
  }

  try {
    do {
      const result = await client.getTransactions(mapping.providerAccountUid, {
        continuationKey,
        dateFrom,
        strategy
      });

      pagesFetched++;
      continuationKey = result.continuationKey;
      const pageTransactions = result.transactions;
      fetched += pageTransactions.length + result.skippedInvalid;
      skippedInvalid += result.skippedInvalid;

      for (const t of pageTransactions) {
         if (t.status !== "BOOKED") {
           skippedInvalid++;
           continue;
         }

         if (t.currency !== account.currency) {
           skippedCurrencyMismatch++;
           continue;
         }

         try {
           await db.$transaction(async (tx) => {
             const existing = await tx.externalTransactionMapping.findUnique({
               where: {
                 externalAccountMappingId_dedupKey: {
                   externalAccountMappingId: mapping.id,
                   dedupKey: t.dedupKey
                 }
               }
             });
             if (existing) {
               duplicates++;
               return;
             }

             const createdTx = await tx.transaction.create({
               data: {
                 userId,
                 accountId: account.id,
                 date: t.date,
                 description: t.description,
                 direction: t.creditDebitIndicator === "CREDIT" ? "Credit" : "Debit",
                 amount: t.amount,
                 categoryId: null,
                 tags: "",
                 notes: null
               }
             });

             await tx.externalTransactionMapping.create({
               data: {
                 externalAccountMappingId: mapping.id,
                 transactionId: createdTx.id,
                 dedupKey: t.dedupKey,
                 entryReference: t.entryReference,
                 providerTransactionId: t.providerTransactionId
               }
             });

             imported++;
           });
         } catch (e: any) {
           if (e.code === "P2002") {
             duplicates++;
           } else {
             throw e;
           }
         }
      }
    } while (continuationKey);

    const now = new Date();
    await db.externalAccountMapping.update({
      where: { id: mapping.id },
      data: { lastTransactionSyncedAt: now }
    });

    return {
      success: true,
      fetched,
      imported,
      duplicates,
      skippedCurrencyMismatch,
      skippedInvalid,
      pagesFetched,
      lastTransactionSyncedAt: now
    };

  } catch (e: any) {
    if (e.name === "EnableBankingProviderError") {
       const code = e.body?.error;
       if (code === "EXPIRED_SESSION") {
         await db.bankConnection.update({
           where: { id: connection.id },
           data: { status: "EXPIRED" }
         });
         return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
       } else if (code === "REVOKED_SESSION" || code === "CLOSED_SESSION") {
         await db.bankConnection.update({
           where: { id: connection.id },
           data: { status: "REVOKED" }
         });
         return { reauthRequired: true, institutionName: connection.institutionName, institutionCountry: connection.institutionCountry };
       }
    }
    throw new Error("Provider synchronization failed");
  }
}
