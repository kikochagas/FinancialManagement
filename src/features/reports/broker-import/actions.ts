"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const brokerShapeSchema = z.enum([
  "EMPTY",
  "DATE_DD_MM_YYYY",
  "DATE_ISO",
  "DATETIME_ISO",
  "EXCEL_DATE_SERIAL",
  "NEGATIVE_NUMBER",
  "POSITIVE_NUMBER",
  "CURRENCY_CODE",
  "ISIN_LIKE",
  "SHORT_TEXT",
  "LONG_TEXT",
  "UNKNOWN_TEXT"
]);

const aiMappingInputSchema = z.object({
  columns: z.array(
    z.object({
      index: z.number(),
      normalizedHeader: z.string().max(100),
      valueShapes: z.array(brokerShapeSchema).max(15)
    })
  ).max(50)
});

export const mapBrokerColumnsWithAIAction = authActionClient
  .schema(aiMappingInputSchema)
  .action(async ({ parsedInput }) => {
    const { BrokerTransactionAIMapper } = await import("./ai-column-mapper");
    const { openAIProvider } = await import("../../../lib/ai/providers/openai");

    const aiMapper = new BrokerTransactionAIMapper(openAIProvider);
    
    try {
      const result = await aiMapper.mapColumns(parsedInput.columns);
      return { success: true, result };
    } catch (err: any) {
      throw new Error("AI_MAPPING_UNAVAILABLE");
    }
  });

const parsedBrokerTransactionSchema = z.object({
  occurredAt: z.string().min(1),
  eventType: z.enum([
    "BUY", "SELL", "DIVIDEND", "INTEREST", "CASH_DEPOSIT", 
    "CASH_WITHDRAWAL", "ASSET_TRANSFER_IN", "ASSET_TRANSFER_OUT", 
    "FEE", "TAX", "CORPORATE_ACTION", "OTHER", "IGNORE"
  ]),
  rawEventType: z.string().nullable(),
  rawCategory: z.string().nullable(),
  assetClass: z.string().nullable(),
  instrumentName: z.string().nullable(),
  instrumentIdentifier: z.string().nullable(),
  isin: z.string().nullable(),
  ticker: z.string().nullable(),
  quantity: z.number().finite().nullable(),
  unitPrice: z.number().finite().nullable(),
  amount: z.number().finite().nullable(),
  fee: z.number().finite().nullable(),
  tax: z.number().finite().nullable(),
  currency: z.string().nullable(),
  originalAmount: z.number().finite().nullable(),
  originalCurrency: z.string().nullable(),
  fxRate: z.number().finite().nullable(),
  description: z.string().nullable(),
  externalId: z.string().nullable(),
  sourceRow: z.number().int().min(0),
  candidateIndex: z.number().int().min(0).optional() // Useful for UI duplicate tracking
});

export const previewBrokerDuplicatesAction = authActionClient
  .schema(z.object({
    accountId: z.string().min(1),
    transactions: z.array(parsedBrokerTransactionSchema)
  }))
  .action(async ({ parsedInput: { accountId, transactions }, ctx: { userId } }) => {
    const { generateDedupKey } = await import("./dedup");
    
    // First map all candidate keys to find within-file duplicates
    const candidateKeys = new Map<string, number>();
    const duplicateIndices: number[] = [];
    
    for (const [idx, tx] of transactions.entries()) {
      if (tx.eventType === "IGNORE") continue;

      const key = generateDedupKey(accountId, tx as any);
      if (candidateKeys.has(key)) {
         duplicateIndices.push(tx.candidateIndex ?? idx);
      } else {
         candidateKeys.set(key, tx.candidateIndex ?? idx);
      }
    }

    const uniqueKeys = Array.from(candidateKeys.keys());

    const existing = await db.investmentEvent.findMany({
      where: {
        userId,
        accountId,
      },
      select: {
        eventType: true,
        amount: true,
        fee: true,
        tax: true,
        currency: true,
        dedupKey: true
      }
    });

    const account = await db.account.findFirst({
      where: { id: accountId, userId },
      select: { currency: true, externalMappings: true, balance: true }
    });

    if (!account) {
      throw new Error("Account not found or unauthorized.");
    }
    
    const hasActiveMapping = account.externalMappings.some(m => m.disconnectedAt === null);
    if (hasActiveMapping) {
      throw new Error("Cannot preview broker transactions into an actively connected Open Banking account. Please disconnect it first.");
    }

    const existingDupes = existing.filter(e => uniqueKeys.includes(e.dedupKey));
    const dbDupes = new Set(existingDupes.map(e => e.dedupKey));

    for (const [key, idx] of candidateKeys.entries()) {
       if (dbDupes.has(key)) {
         duplicateIndices.push(idx);
       }
    }

    const { calculateAccountBalance } = await import("./cash-balance");
    const existingBalanceCalculation = calculateAccountBalance(existing as any, account.currency || "EUR");

    return { 
      success: true, 
      duplicateIndices,
      currentAccountBalance: account.balance,
      existingLedgerBalance: existingBalanceCalculation.balance,
      existingLedgerBalanceSafe: existingBalanceCalculation.isSafe,
      accountCurrency: account.currency || "EUR"
    };
  });

export async function importBrokerTransactionsForUser(userId: string, accountId: string, transactions: any[], updateCashBalance?: boolean) {
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    include: { externalMappings: true }
  });

  if (!account) {
    throw new Error("Account not found or unauthorized.");
  }

  const hasActiveMapping = account.externalMappings.some(m => m.disconnectedAt === null);
  if (hasActiveMapping) {
    throw new Error("Cannot import broker transactions into an actively connected Open Banking account. Please disconnect it first.");
  }

  let insertedCount = 0;
  let skippedCount = 0;
  let balanceUpdated = false;
  let resultingBalance = undefined;

  const { validateBrokerTransaction } = await import("./validation");
  const { parseBrokerDatetimeStrict } = await import("./date-parser");
  const { generateDedupKey } = await import("./dedup");

  const candidates: any[] = [];
  
  for (const tx of transactions) {
    if (tx.eventType === "IGNORE") {
      skippedCount++;
      continue;
    }

    const txForValidation = { ...tx, valid: true, warnings: [] };
    validateBrokerTransaction(txForValidation as any);
    if (!txForValidation.valid) {
      throw new Error(`Server-side validation failed for transaction at row ${tx.sourceRow}: ${txForValidation.warnings.join(", ")}`);
    }
    
    const parsedDate = parseBrokerDatetimeStrict(tx.occurredAt);
    if (!parsedDate.valid || !parsedDate.value) {
      throw new Error(`Strict server validation failed for occurredAt date at row ${tx.sourceRow}: ${parsedDate.warning || 'Invalid'}`);
    }
    const dateObj = new Date(parsedDate.value);
    if (isNaN(dateObj.getTime())) {
      throw new Error(`Invalid occurredAt Date object at row ${tx.sourceRow}`);
    }

    const dedupKey = generateDedupKey(accountId, tx as any);

    candidates.push({
      userId,
      accountId,
      occurredAt: dateObj,
      eventType: tx.eventType!,
      rawEventType: tx.rawEventType,
      rawCategory: tx.rawCategory,
      assetClass: tx.assetClass,
      instrumentName: tx.instrumentName,
      instrumentIdentifier: tx.instrumentIdentifier,
      isin: tx.isin,
      ticker: tx.ticker,
      quantity: tx.quantity,
      unitPrice: tx.unitPrice,
      amount: tx.amount,
      fee: tx.fee,
      tax: tx.tax,
      currency: tx.currency,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency,
      fxRate: tx.fxRate,
      description: tx.description,
      externalId: tx.externalId,
      sourceRow: tx.sourceRow,
      dedupKey,
    });
  }

  if (candidates.length === 0 && !updateCashBalance) {
    return { success: true, insertedCount, skippedCount, balanceUpdated, resultingBalance };
  }

  try {
    await db.$transaction(async (txDb) => {
      let newEvents = [];
      
      if (candidates.length > 0) {
        const dedupKeys = candidates.map(c => c.dedupKey);
        const existing = await txDb.investmentEvent.findMany({
          where: {
            accountId,
            userId,
            dedupKey: { in: dedupKeys }
          },
          select: { dedupKey: true }
        });
        
        const existingSet = new Set(existing.map(e => e.dedupKey));
        newEvents = [];
        for (const c of candidates) {
          if (existingSet.has(c.dedupKey)) {
            skippedCount++;
          } else {
            existingSet.add(c.dedupKey);
            newEvents.push(c);
          }
        }

        if (newEvents.length > 0) {
          await txDb.investmentEvent.createMany({
            data: newEvents
          });
          insertedCount += newEvents.length;
        }
      }

      if (updateCashBalance) {
        const allEvents = await txDb.investmentEvent.findMany({
          where: { accountId, userId },
          select: {
            eventType: true,
            amount: true,
            fee: true,
            tax: true,
            currency: true
          }
        });
        const { calculateAccountBalance } = await import("./cash-balance");
        const balanceCalculation = calculateAccountBalance(allEvents as any, account.currency);
        
        if (balanceCalculation.isSafe) {
          await txDb.account.update({
            where: { id: accountId },
            data: { balance: balanceCalculation.balance }
          });
          balanceUpdated = true;
          resultingBalance = balanceCalculation.balance;
        } else {
          throw new Error("Cash balance calculation was unsafe (e.g. multi-currency events without FX conversion). Transaction aborted.");
        }
      }
    }, {
      maxWait: 5000,
      timeout: 30000
    });
  } catch (err: any) {
    if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
      throw new Error("A concurrent import was detected and safely aborted to prevent duplicates. Please try again.");
    }
    throw err;
  }

  return { success: true, insertedCount, skippedCount, balanceUpdated, resultingBalance };
}

const importTransactionsSchema = z.object({
  accountId: z.string().min(1),
  transactions: z.array(parsedBrokerTransactionSchema),
  updateCashBalance: z.boolean().optional()
}).refine(data => data.transactions.length > 0 || data.updateCashBalance, {
  message: "At least one transaction or balance update required."
});

export const importBrokerTransactionsAction = authActionClient
  .schema(importTransactionsSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { accountId, transactions, updateCashBalance } = parsedInput;
    const res = await importBrokerTransactionsForUser(userId, accountId, transactions, updateCashBalance);
    
    revalidatePath("/");
    revalidatePath("/reports");
    revalidatePath("/investments"); // Even though we don't update investments yet, cache clear is safe.

    return res;
  });
