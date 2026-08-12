"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const createGoalSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().default(0),
  estimatedCompletion: z.string().optional().nullable(),
});

const updateGoalSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().optional(),
  estimatedCompletion: z.string().optional().nullable(),
});

const deleteGoalSchema = z.object({
  id: z.string(),
});

export const createGoal = authActionClient
  .schema(createGoalSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const progress = (parsedInput.currentAmount / parsedInput.targetAmount) * 100;
    const goal = await db.goal.create({
      data: {
        ...parsedInput,
        userId,
        progress,
      },
    });
    revalidatePath("/");
    revalidatePath("/goals");
    return { success: true, goal };
  });

export const updateGoal = authActionClient
  .schema(updateGoalSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id, ...data } = parsedInput;

    const original = await db.goal.findUnique({ where: { id } });
    if (!original || original.userId !== userId) throw new Error("Goal not found");

    const targetAmount = data.targetAmount !== undefined ? data.targetAmount : original.targetAmount;
    const currentAmount = data.currentAmount !== undefined ? data.currentAmount : original.currentAmount;
    const progress = (currentAmount / targetAmount) * 100;

    const updated = await db.goal.update({
      where: { id },
      data: {
        ...data,
        progress,
      },
    });

    revalidatePath("/");
    revalidatePath("/goals");
    return { success: true, goal: updated };
  });

export const deleteGoal = authActionClient
  .schema(deleteGoalSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const original = await db.goal.findUnique({ where: { id: parsedInput.id } });
    if (!original || original.userId !== userId) throw new Error("Goal not found");

    await db.goal.delete({ where: { id: parsedInput.id } });
    revalidatePath("/");
    revalidatePath("/goals");
    return { success: true };
  });
