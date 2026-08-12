"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateInvestmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  symbol: z.string().optional().nullable(),
  quantity: z.number().optional(),
  costBasis: z.number().optional(),
  marketValue: z.number().optional(),
});

export const updateInvestment = authActionClient
  .schema(updateInvestmentSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id, ...data } = parsedInput;

    const original = await db.investment.findUnique({ where: { id } });
    if (!original || original.userId !== userId) throw new Error("Investment not found");

    const costBasis = data.costBasis !== undefined ? data.costBasis : original.costBasis;
    const marketValue = data.marketValue !== undefined ? data.marketValue : original.marketValue;
    const profit = marketValue - costBasis;

    const updated = await db.investment.update({
      where: { id },
      data: {
        ...data,
        profit,
      },
    });

    // Recompute allocations across all investments
    const allInvestments = await db.investment.findMany({ where: { userId } });
    const totalMarketValue = allInvestments.reduce((sum, inv) => sum + inv.marketValue, 0);

    if (totalMarketValue > 0) {
      for (const inv of allInvestments) {
        let currentMarketVal = inv.id === id ? marketValue : inv.marketValue;
        let newAllocation = (currentMarketVal / totalMarketValue) * 100;
        await db.investment.update({
          where: { id: inv.id },
          data: { allocation: newAllocation },
        });
      }
    }

    revalidatePath("/");
    revalidatePath("/investments");
    return { success: true, investment: updated };
  });

const createInvestmentSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  symbol: z.string().optional().nullable(),
  quantity: z.number().nonnegative(),
  costBasis: z.number().nonnegative(),
  marketValue: z.number().nonnegative(),
});

export const createInvestment = authActionClient
  .schema(createInvestmentSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const profit = parsedInput.marketValue - parsedInput.costBasis;

    const created = await db.investment.create({
      data: {
        userId,
        ...parsedInput,
        profit,
        allocation: 0,
      },
    });

    // Recompute allocations across all investments
    const allInvestments = await db.investment.findMany({ where: { userId } });
    const totalMarketValue = allInvestments.reduce((sum, inv) => sum + inv.marketValue, 0);

    if (totalMarketValue > 0) {
      for (const inv of allInvestments) {
        let newAllocation = (inv.marketValue / totalMarketValue) * 100;
        await db.investment.update({
          where: { id: inv.id },
          data: { allocation: newAllocation },
        });
      }
    }

    revalidatePath("/");
    revalidatePath("/investments");
    return { success: true, investment: created };
  });

const deleteInvestmentSchema = z.object({
  id: z.string(),
});

export const deleteInvestment = authActionClient
  .schema(deleteInvestmentSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id } = parsedInput;

    const original = await db.investment.findUnique({ where: { id } });
    if (!original || original.userId !== userId) throw new Error("Investment not found");

    await db.investment.delete({ where: { id } });

    // Recompute allocations across all investments
    const allInvestments = await db.investment.findMany({ where: { userId } });
    const totalMarketValue = allInvestments.reduce((sum, inv) => sum + inv.marketValue, 0);

    for (const inv of allInvestments) {
      let newAllocation = totalMarketValue > 0 ? (inv.marketValue / totalMarketValue) * 100 : 0;
      await db.investment.update({
        where: { id: inv.id },
        data: { allocation: newAllocation },
      });
    }

    revalidatePath("/");
    revalidatePath("/investments");
    return { success: true };
  });
