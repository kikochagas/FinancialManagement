"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { TransactionType } from "@/lib/constants";
import { directionToLegacyType } from "./legacy-migration";

// Helper function to update account balance
async function adjustBalances(
  txDb: any,
  tx: {
    direction: string;
    amount: number;
    accountId: string | null;
    destinationAccountId?: string | null;
  },
  multiplier: number
) {
  // multiplier: 1 to apply transaction, -1 to reverse transaction
  const amount = tx.amount * multiplier;

  if (tx.accountId) {
    const acc = await txDb.account.findUnique({ where: { id: tx.accountId }, include: { externalMappings: true } });
    if (acc && (!acc.externalMappings || !acc.externalMappings.some((m: any) => m.disconnectedAt === null))) {
      if (tx.direction === "Credit") {
        // Increase account balance
        await txDb.account.update({
          where: { id: tx.accountId },
          data: { balance: { increment: amount } },
        });
      } else if (tx.direction === "Debit") {
        // Decrease account balance
        await txDb.account.update({
          where: { id: tx.accountId },
          data: { balance: { decrement: amount } },
        });
      }
    }
  }

  if (tx.direction === "Debit" && tx.destinationAccountId) {
    const destAcc = await txDb.account.findUnique({ where: { id: tx.destinationAccountId }, include: { externalMappings: true } });
    if (destAcc && (!destAcc.externalMappings || !destAcc.externalMappings.some((m: any) => m.disconnectedAt === null))) {
      // Increase destination account
      await txDb.account.update({
        where: { id: tx.destinationAccountId },
        data: { balance: { increment: amount } },
      });
    }
  }
}

// Schemas
const createTransactionSchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  direction: z.enum(["Debit", "Credit"]),
  amount: z.number().positive(),
  accountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  destinationAccountId: z.string().optional().nullable(), // For internal transfers
  tags: z.string().optional(),
  notes: z.string().optional(),
});

const updateTransactionSchema = z.object({
  id: z.string(),
  date: z.string().optional(),
  description: z.string().optional(),
  direction: z.enum(["Debit", "Credit"]).optional(),
  amount: z.number().positive().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  destinationAccountId: z.string().optional().nullable(),
  tags: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const deleteTransactionSchema = z.object({
  id: z.string(),
});

const bulkDeleteTransactionsSchema = z.object({
  ids: z.array(z.string()),
});

// Actions
export const createTransaction = authActionClient
  .schema(createTransactionSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const tx = await db.$transaction(async (txDb) => {
      if (parsedInput.accountId) {
        const acc = await txDb.account.findUnique({ where: { id: parsedInput.accountId }, include: { externalMappings: true } });
        if (!acc || acc.userId !== userId) throw new Error("Invalid or unauthorized account");
        if (acc.externalMappings.some(m => m.disconnectedAt === null)) throw new Error("Bank-connected account transactions are managed by bank synchronization.");
      }

      if (parsedInput.destinationAccountId) {
        const dacc = await txDb.account.findUnique({ where: { id: parsedInput.destinationAccountId }, include: { externalMappings: true } });
        if (!dacc || dacc.userId !== userId) throw new Error("Invalid or unauthorized destination account");
        if (dacc.externalMappings.some(m => m.disconnectedAt === null)) throw new Error("Bank-connected account transactions are managed by bank synchronization.");
      }

      if (parsedInput.categoryId) {
        const cat = await txDb.category.findUnique({ where: { id: parsedInput.categoryId } });
        if (!cat || cat.userId !== userId) throw new Error("Invalid or unauthorized category");
      }

      const created = await txDb.transaction.create({
        data: {
          userId,
          date: new Date(parsedInput.date),
          description: parsedInput.description,
          type: directionToLegacyType(parsedInput.direction),
          direction: parsedInput.direction,
          amount: parsedInput.amount,
          accountId: parsedInput.accountId,
          categoryId: parsedInput.categoryId || null,
          destinationAccountId: parsedInput.destinationAccountId || null,
          tags: parsedInput.tags || "",
          notes: parsedInput.notes || null,
        },
      });

      // Update balances
      await adjustBalances(txDb, created, 1);
      return created;
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { success: true, transaction: tx };
  });

export const updateTransaction = authActionClient
  .schema(updateTransactionSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id, ...data } = parsedInput;

    const tx = await db.$transaction(async (txDb) => {
      const original = await txDb.transaction.findUnique({
        where: { id },
        include: { externalMapping: true }
      });

      if (!original || original.userId !== userId) {
        throw new Error("Transaction not found");
      }

      if (original.externalMapping) {
        const changedBankFields = [];
        if (data.amount !== undefined && data.amount !== original.amount) changedBankFields.push('amount');
        if (data.date !== undefined && new Date(data.date).getTime() !== original.date.getTime()) changedBankFields.push('date');
        if (data.description !== undefined && data.description !== original.description) changedBankFields.push('description');
        if (data.direction !== undefined && data.direction !== original.direction) changedBankFields.push('direction');
        if (data.accountId !== undefined && data.accountId !== original.accountId) changedBankFields.push('accountId');
        if (data.destinationAccountId !== undefined && data.destinationAccountId !== original.destinationAccountId) changedBankFields.push('destinationAccountId');

        if (changedBankFields.length > 0) {
           throw new Error("Cannot edit bank-controlled fields on a synced transaction.");
        }

        if (data.categoryId) {
           const cat = await txDb.category.findUnique({ where: { id: data.categoryId } });
           if (!cat || cat.userId !== userId) throw new Error("Invalid or unauthorized category");
        }

        // Bank imported transaction. Only allow metadata updates
        const updateData: any = {};
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.tags !== undefined) updateData.tags = data.tags;
        if (data.notes !== undefined) updateData.notes = data.notes;

        const updated = await txDb.transaction.update({
          where: { id },
          data: updateData
        });
        return updated;
      }

      // 1. Validate if moving to a bank-connected account
      if (data.accountId !== undefined && data.accountId !== original.accountId && data.accountId !== null) {
        const acc = await txDb.account.findUnique({ where: { id: data.accountId }, include: { externalMappings: true } });
        if (!acc || acc.userId !== userId) throw new Error("Invalid or unauthorized account");
        if (acc.externalMappings.some(m => m.disconnectedAt === null)) throw new Error("Bank-connected account transactions are managed by bank synchronization.");
      }
      if (data.destinationAccountId !== undefined && data.destinationAccountId !== original.destinationAccountId && data.destinationAccountId !== null) {
        const dacc = await txDb.account.findUnique({ where: { id: data.destinationAccountId }, include: { externalMappings: true } });
        if (!dacc || dacc.userId !== userId) throw new Error("Invalid or unauthorized destination account");
        if (dacc.externalMappings.some(m => m.disconnectedAt === null)) throw new Error("Bank-connected account transactions are managed by bank synchronization.");
      }

      if (data.categoryId) {
         const cat = await txDb.category.findUnique({ where: { id: data.categoryId } });
         if (!cat || cat.userId !== userId) throw new Error("Invalid or unauthorized category");
      }

      // 2. Reverse original balance changes
      await adjustBalances(txDb, original, -1);

      // 2. Prepare update payload
      const updateData: any = {};
      if (data.date) updateData.date = new Date(data.date);
      if (data.description) updateData.description = data.description;
      if (data.direction) {
        updateData.direction = data.direction;
        updateData.type = directionToLegacyType(data.direction);
      }
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.accountId) updateData.accountId = data.accountId;
      if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
      if (data.destinationAccountId !== undefined) updateData.destinationAccountId = data.destinationAccountId;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.notes !== undefined) updateData.notes = data.notes;

      // 3. Update in database
      const updated = await txDb.transaction.update({
        where: { id },
        data: updateData,
      });

      // 4. Apply new balance changes
      await adjustBalances(txDb, updated, 1);

      return updated;
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { success: true, transaction: tx };
  });

export const deleteTransaction = authActionClient
  .schema(deleteTransactionSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id } = parsedInput;

    await db.$transaction(async (txDb) => {
      const original = await txDb.transaction.findUnique({
        where: { id },
        include: { externalMapping: true }
      });

      if (!original || original.userId !== userId) {
        throw new Error("Transaction not found");
      }

      if (original.externalMapping) {
        throw new Error("Bank-synced transactions cannot be deleted.");
      }

      // Reverse balance changes
      await adjustBalances(txDb, original, -1);

      // Delete transaction
      await txDb.transaction.delete({
        where: { id },
      });
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { success: true };
  });

export const bulkDeleteTransactions = authActionClient
  .schema(bulkDeleteTransactionsSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { ids } = parsedInput;

    await db.$transaction(async (txDb) => {
      for (const id of ids) {
        const original = await txDb.transaction.findUnique({
          where: { id },
          include: { externalMapping: true }
        });
        if (original && original.userId === userId) {
          if (original.externalMapping) {
            throw new Error("Bank-synced transactions cannot be deleted.");
          }
          await adjustBalances(txDb, original, -1);
          await txDb.transaction.delete({
            where: { id },
          });
        }
      }
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { success: true };
  });
