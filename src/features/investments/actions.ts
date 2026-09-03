"use server";

import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canHoldInvestments } from "@/lib/constants";

async function validateInvestmentAccount(accountId: string, userId: string) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: {
      userId: true,
      type: true,
    },
  });

  if (!account || account.userId !== userId) {
    throw new Error("Unauthorized account");
  }

  if (!canHoldInvestments(account.type)) {
    throw new Error("Account cannot hold investments");
  }

  return account;
}

const updateInvestmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  symbol: z.string().optional().nullable(),
  isin: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  quantity: z.number().optional(),
  costBasis: z.number().optional().nullable(),
  marketValue: z.number().optional(),
});

export const updateInvestment = authActionClient
  .schema(updateInvestmentSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { id, ...data } = parsedInput;

    const original = await db.investment.findUnique({ where: { id } });
    if (!original || original.userId !== userId)
      throw new Error("Investment not found");
    if (data.accountId !== undefined) {
      if (data.accountId === null) {
        // Legacy unassigned Investments may remain unassigned,
        // but an already assigned Investment cannot be unassigned again.
        if (original.accountId !== null) {
          throw new Error("Investment account cannot be removed");
        }
      } else {
        await validateInvestmentAccount(data.accountId, userId);
      }
    }

    const costBasis =
      data.costBasis !== undefined ? data.costBasis : original.costBasis;
    const marketValue =
      data.marketValue !== undefined ? data.marketValue : original.marketValue;
    const profit = costBasis != null ? marketValue - costBasis : null;

    const updated = await db.investment.update({
      where: { id },
      data: {
        ...data,
        profit,
      },
    });

    // Recompute allocations across all investments
    const allInvestments = await db.investment.findMany({ where: { userId } });
    const totalMarketValue = allInvestments.reduce(
      (sum, inv) => sum + inv.marketValue,
      0,
    );

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
  isin: z.string().optional().nullable(),
  accountId: z.string().min(1, "Investment account is required"),
  quantity: z.number().nonnegative(),
  costBasis: z.number().nonnegative().optional().nullable(),
  marketValue: z.number().nonnegative(),
});

export const createInvestment = authActionClient
  .schema(createInvestmentSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    await validateInvestmentAccount(parsedInput.accountId, userId);
    const profit =
      parsedInput.costBasis != null
        ? parsedInput.marketValue - parsedInput.costBasis
        : null;

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
    const totalMarketValue = allInvestments.reduce(
      (sum, inv) => sum + inv.marketValue,
      0,
    );

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
    if (!original || original.userId !== userId)
      throw new Error("Investment not found");

    await db.investment.delete({ where: { id } });

    // Recompute allocations across all investments
    const allInvestments = await db.investment.findMany({ where: { userId } });
    const totalMarketValue = allInvestments.reduce(
      (sum, inv) => sum + inv.marketValue,
      0,
    );

    for (const inv of allInvestments) {
      let newAllocation =
        totalMarketValue > 0 ? (inv.marketValue / totalMarketValue) * 100 : 0;
      await db.investment.update({
        where: { id: inv.id },
        data: { allocation: newAllocation },
      });
    }

    revalidatePath("/");
    revalidatePath("/investments");
    return { success: true };
  });

import { BrokerSnapshotSchema } from "./broker-import/schema";
import { reconcileSnapshot } from "./broker-import/reconciliation";

const reconcileSnapshotSchema = z.object({
  accountId: z.string(),
  snapshot: BrokerSnapshotSchema,
});

export const getSnapshotReconciliation = authActionClient
  .schema(reconcileSnapshotSchema)
  .action(async ({ parsedInput: { accountId, snapshot }, ctx: { userId } }) => {
    await validateInvestmentAccount(accountId, userId);

    const investments = await db.investment.findMany({
      where: { accountId, userId },
      select: {
        id: true,
        accountId: true,
        name: true,
        type: true,
        symbol: true,
        quantity: true,
        marketValue: true,
        isin: true,
        instrumentIdentifier: true,
        instrumentIdentifierType: true,
      },
    });

    return reconcileSnapshot(snapshot, accountId, investments);
  });
