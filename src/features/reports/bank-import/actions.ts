"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { classifyTransactions } from "./category-classifier";

const importBankStatementSchema = z.object({
  accountId: z.string().min(1),
  updateBalance: z.boolean().default(false),
  endingBalance: z.number().finite().optional(),
  transactions: z.array(
    z.object({
      bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid calendar date"),
      description: z.string().min(1, "Description is required"),
      amount: z.number().finite().positive(),
      direction: z.enum(["Debit", "Credit"]),
      categoryId: z.string().nullable().optional(),
      forceImportDuplicate: z.boolean().default(false),
      currency: z.string().nullable().optional(),
    })
  ).min(1, "At least one valid transaction is required.")
}).refine(function(data) {
  if (data.updateBalance && (data.endingBalance === null || data.endingBalance === undefined)) {
    return false;
  }
  return true;
}, { message: "Ending balance is required if updateBalance is true." });

export const importBankStatementAction = authActionClient
  .schema(importBankStatementSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { accountId, updateBalance, endingBalance, transactions } = parsedInput;

    // 1. Verify eligibility
    const account = await db.account.findFirst({
      where: { id: accountId, userId },
      include: { externalMappings: true }
    });

    if (!account) {
      throw new Error("Account not found or unauthorized.");
    }

    const validCurrencies = new Set<string>();
    transactions.forEach(tx => {
      if (tx.currency) validCurrencies.add(tx.currency);
    });

    if (validCurrencies.size > 1) {
      throw new Error("Cannot import multi-currency statements.");
    }
    
    if (validCurrencies.size === 1) {
      const derivedCurrency = Array.from(validCurrencies)[0];
      if (account.currency.toUpperCase() !== derivedCurrency.toUpperCase()) {
        throw new Error("Statement currency does not match account currency.");
      }
    }

    // Check for ACTIVE mappings
    const hasActiveMapping = account.externalMappings.some(m => m.disconnectedAt === null);
    if (hasActiveMapping) {
      throw new Error("Cannot import unstructured bank statement into an actively connected Open Banking account. Please disconnect it first.");
    }

    // Schema superRefine already handles updateBalance logic, but just in case:
    if (updateBalance && (endingBalance === null || endingBalance === undefined)) {
      throw new Error("Ending balance is required if updateBalance is true.");
    }

    let insertedCount = 0;
    let probableDuplicatesSkipped = 0;

    // Validate real calendar dates
    transactions.forEach(tx => {
       const d = new Date(tx.bookingDate);
       if (isNaN(d.getTime()) || d.toISOString().split('T')[0] !== tx.bookingDate) {
          throw new Error(`Invalid calendar date: ${tx.bookingDate}`);
       }
    });

    await db.$transaction(async (txDb) => {
      // Validate category ownership
      const categoryIds = [...new Set(transactions.map(t => t.categoryId).filter(Boolean))] as string[];
      if (categoryIds.length > 0) {
        const ownedCats = await txDb.category.findMany({
          where: { id: { in: categoryIds }, userId }
        });
        if (ownedCats.length !== categoryIds.length) {
          throw new Error("One or more categories do not belong to the user.");
        }
      }
      // 2. Process transactions
      // Because we do NOT use normal adjustBalances() here to prevent side-effects, we just insert.
      for (const tx of transactions) {
        if (!tx.forceImportDuplicate) {
          // A simplified duplicate check on the server using db matching
          // (In a real app we'd compute the hash, but for V1 we can do a direct query match on date+desc+amount)
          const existing = await txDb.transaction.findFirst({
            where: {
              accountId,
              date: new Date(tx.bookingDate),
              description: tx.description,
              amount: tx.amount,
              direction: tx.direction
            }
          });

          if (existing) {
            probableDuplicatesSkipped++;
            continue; // Skip probable duplicate
          }
        }

        await txDb.transaction.create({
          data: {
            userId,
            accountId,
            date: new Date(tx.bookingDate),
            description: tx.description,
            amount: tx.amount,
            type: tx.direction === "Credit" ? "Income" : "Expense",
            direction: tx.direction,
            categoryId: tx.categoryId,
            tags: "Imported"
          }
        });
        insertedCount++;
      }

      // 3. Exact Balance Override (if enabled)
      if (updateBalance && endingBalance !== null && endingBalance !== undefined) {
        await txDb.account.update({
          where: { id: accountId },
          data: { balance: endingBalance }
        });
      }
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/reports");

    return { success: true, insertedCount, probableDuplicatesSkipped };
  });

export const previewBankStatementDuplicatesAction = authActionClient
  .schema(z.object({
    accountId: z.string().min(1),
    transactions: z.array(
      z.object({
        candidateIndex: z.number(),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid calendar date"),
        description: z.string().min(1),
        amount: z.number().finite().positive(),
        direction: z.enum(["Debit", "Credit"])
      })
    )
  }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { accountId, transactions } = parsedInput;

    const account = await db.account.findFirst({
      where: { id: accountId, userId }
    });
    if (!account) throw new Error("Account not found");

    // Validate real calendar dates
    transactions.forEach(tx => {
       const d = new Date(tx.bookingDate);
       if (isNaN(d.getTime()) || d.toISOString().split('T')[0] !== tx.bookingDate) {
          throw new Error(`Invalid calendar date: ${tx.bookingDate}`);
       }
    });

    const duplicateIndices: number[] = [];
    
    // Batch fetch candidates for the exact dates to minimize DB calls
    const dates = [...new Set(transactions.map(t => new Date(t.bookingDate).getTime()))].map(t => new Date(t));
    const existing = await db.transaction.findMany({
      where: { accountId, date: { in: dates } },
      select: { date: true, description: true, amount: true, direction: true }
    });

    transactions.forEach((tx) => {
      const match = existing.find(e => 
        e.date.getTime() === new Date(tx.bookingDate).getTime() &&
        e.description === tx.description &&
        e.amount === tx.amount &&
        e.direction === tx.direction
      );
      if (match) duplicateIndices.push(tx.candidateIndex);
    });

    const categories = await classifyTransactions(userId, transactions);

    return { success: true, duplicateIndices, categories };
  });

const shapeSchema = z.enum([
  "EMPTY",
  "DATE_DD_MM_YYYY",
  "DATE_ISO",
  "EXCEL_DATE_SERIAL",
  "NEGATIVE_EUR_AMOUNT",
  "POSITIVE_EUR_AMOUNT",
  "NEGATIVE_NUMBER",
  "POSITIVE_NUMBER",
  "CURRENCY_CODE",
  "IBAN",
  "ACCOUNT_IDENTIFIER",
  "SHORT_TEXT",
  "LONG_TEXT",
  "UNKNOWN_TEXT"
]);

const aiMappingInputSchema = z.object({
  columns: z.array(
    z.object({
      index: z.number(),
      normalizedHeader: z.string().max(100), // Bounding length
      valueShapes: z.array(shapeSchema).max(15) // Limit shape samples
    })
  ).max(50) // Max 50 columns
});

export const mapBankStatementColumnsWithAIAction = authActionClient
  .schema(aiMappingInputSchema)
  .action(async ({ parsedInput }) => {
    // Dynamic import to keep AIProvider server-only
    const { BankStatementAIMapper } = await import("./ai-column-mapper");
    const { openAIProvider } = await import("../../../lib/ai/providers/openai");

    const aiMapper = new BankStatementAIMapper(openAIProvider);
    
    try {
      const result = await aiMapper.mapColumns(parsedInput.columns);
      return { success: true, result };
    } catch (err: any) {
      throw new Error("AI_MAPPING_UNAVAILABLE");
    }
  });

