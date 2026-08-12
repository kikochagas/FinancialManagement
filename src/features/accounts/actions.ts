"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

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
    const existing = await db.account.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Unauthorized");

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
    const existing = await db.account.findUnique({ where: { id: parsedInput.id } });
    if (!existing || existing.userId !== userId) throw new Error("Unauthorized");

    await db.account.delete({
      where: { id: parsedInput.id },
    });
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
    return { success: true };
  });
