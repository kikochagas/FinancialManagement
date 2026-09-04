"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { authActionClient } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { extractBrokerSnapshot } from "./broker-import/orchestrator";
import { reconcileSnapshot } from "./broker-import/reconciliation";
import {
  canHoldInvestments,
  mapBrokerAssetClassToInvestmentType,
} from "@/lib/constants";

const PositionIntentSchema = z.object({
  candidateIndex: z.number().int().nonnegative(),
  action: z.enum(["CREATE", "UPDATE", "SKIP"]),
});

export const applySnapshotSchema = z.object({
  accountId: z.string(),
  fileBase64: z.string(),
  positionIntents: z.array(PositionIntentSchema).superRefine((intents, ctx) => {
    const indices = new Set<number>();
    for (const intent of intents) {
      if (indices.has(intent.candidateIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate position intents are not allowed",
        });
        return;
      }
      indices.add(intent.candidateIndex);
    }
  }),
  updateCashBalance: z.boolean().default(false),
});

export const applyBrokerSnapshot = authActionClient
  .schema(applySnapshotSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { accountId, fileBase64, positionIntents, updateCashBalance } =
      parsedInput;

    // 1. Ownership & account type check
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) {
      throw new Error("Unauthorized account");
    }
    if (!canHoldInvestments(account.type)) {
      throw new Error("Account cannot hold investments");
    }

    // 2. Decode and enforce 5 MB limit
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error("File exceeds 5 MB limit");
    }

    // 3. Re-extract server-side to get true fingerprint and snapshot
    const snapshot = await extractBrokerSnapshot(buffer);
    const fingerprint = snapshot.documentFingerprint;
    if (!fingerprint) {
      throw new Error("Could not determine document fingerprint");
    }

    // Statement Date constraint
    if (!snapshot.statementDate) {
      throw new Error(
        "Statement date is required before this snapshot can be applied.",
      );
    }

    // 4. Check for duplicates
    const existingSnapshot = await db.investmentAccountSnapshot.findUnique({
      where: {
        accountId_documentFingerprint: {
          accountId,
          documentFingerprint: fingerprint,
        },
      },
    });
    if (existingSnapshot) {
      return {
        success: false,
        error: "DUPLICATE_FINGERPRINT",
        warning: "This document has already been applied.",
      };
    }

    // 5. Re-run reconciliation
    const currentInvestments = await db.investment.findMany({
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
    const reconciled = reconcileSnapshot(
      snapshot,
      accountId,
      currentInvestments,
    );

    let warnings: string[] = [];

    // 6. DB Transaction
    await db.$transaction(async (tx) => {
      // 6a. Persist immutable snapshot evidence
      await tx.investmentAccountSnapshot.create({
        data: {
          userId,
          accountId,
          statementDate: new Date(snapshot.statementDate!),
          statementDateSource: snapshot.dateProvenance || "UNKNOWN",
          documentFingerprint: fingerprint,
          completeness: snapshot.completeness,
          positions: {
            create: snapshot.positions.map((p) => ({
              name: p.name,
              sourceSection: p.sourceSection,
              assetClass: p.assetClass,
              isin: p.isin,
              ticker: p.ticker,
              instrumentIdentifier: p.instrumentIdentifier,
              instrumentIdentifierType: p.instrumentIdentifierType,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              marketValue: p.marketValue,
              currency: p.currency,
              valuationDate: p.valuationDate ? new Date(p.valuationDate) : null,
            })),
          },
          cashBalances: {
            create: snapshot.cashBalances.map((c) => ({
              type: c.type,
              label: c.label,
              currency: c.currency,
              amount: c.amount,
            })),
          },
          totals: {
            create: snapshot.totals.map((t) => ({
              type: t.type,
              label: t.label,
              currency: t.currency,
              amount: t.amount,
            })),
          },
        },
      });

      // 6b. Apply intents (Server Authoritative)
      let investmentProjectionChanged = false;
      for (const intent of positionIntents) {
        if (intent.action === "SKIP") continue;

        const recPos = reconciled.positions[intent.candidateIndex];
        if (!recPos) {
          throw new Error(`Invalid candidate index ${intent.candidateIndex}`);
        }

        if (recPos.status === "AMBIGUOUS" || recPos.status === "CONFLICT") {
          throw new Error(`Cannot silently apply ${recPos.status} position`);
        }

        const p = recPos.importedPosition;

        if (intent.action === "CREATE") {
          if (recPos.status !== "NEW") {
            throw new Error(
              `Cannot CREATE a position with status ${recPos.status}`,
            );
          }

          if (p.quantity == null || p.marketValue == null) {
            throw new Error(
              "Cannot create investment from a snapshot position with incomplete valuation data",
            );
          }

          const investmentName =
            p.name || p.ticker || p.isin || p.instrumentIdentifier;
          if (!investmentName) {
            throw new Error(
              "Cannot create investment without an identifiable instrument",
            );
          }

          const q = p.quantity;
          const cb = p.costBasis ?? null;
          const mv = p.marketValue;
          const profit = cb != null ? mv - cb : null;
          const canonicalType = mapBrokerAssetClassToInvestmentType(
            p.assetClass,
            p.ticker,
          );

          await tx.investment.create({
            data: {
              userId,
              accountId,
              name: investmentName,
              type: canonicalType,
              symbol: p.ticker,
              isin: p.isin,
              instrumentIdentifier: p.instrumentIdentifier,
              instrumentIdentifierType: p.instrumentIdentifierType,
              quantity: q,
              costBasis: cb,
              marketValue: mv,
              profit,
              allocation: 0, // Computed later
            },
          });
          investmentProjectionChanged = true;
        } else if (intent.action === "UPDATE") {
          if (recPos.status !== "MATCHED") {
            throw new Error(
              `Cannot UPDATE a position with status ${recPos.status}`,
            );
          }
          const matchedId = recPos.matchedInvestmentId;
          if (!matchedId) throw new Error("Missing matched investment ID");

          const existing = await tx.investment.findUnique({
            where: { id: matchedId },
          });
          if (!existing) throw new Error("Existing investment not found");

          const proposed = recPos.proposedChanges || {};

          const updates: any = {};
          if (proposed.quantity !== undefined)
            updates.quantity = proposed.quantity;
          if (proposed.marketValue !== undefined)
            updates.marketValue = proposed.marketValue;
          if (proposed.isin !== undefined) updates.isin = proposed.isin;
          if (proposed.symbol !== undefined) updates.symbol = proposed.symbol;
          if (proposed.instrumentIdentifier !== undefined) {
            updates.instrumentIdentifier = proposed.instrumentIdentifier;
            updates.instrumentIdentifierType =
              proposed.instrumentIdentifierType;
          }

          // Recompute profit safely without touching costBasis
          const newMarketValue = proposed.marketValue ?? existing.marketValue;
          updates.profit =
            existing.costBasis != null
              ? newMarketValue - existing.costBasis
              : null;

          await tx.investment.update({
            where: { id: matchedId },
            data: updates,
          });
          investmentProjectionChanged = true;
        }
      }

      // 6c. Broker cash rule
      if (updateCashBalance) {
        if (snapshot.cashBalances.length === 1) {
          const cash = snapshot.cashBalances[0];
          if (cash.currency === account.currency) {
            await tx.account.update({
              where: { id: accountId },
              data: { balance: cash.amount },
            });
          } else {
            warnings.push(
              "Currency mismatch for cash balance. Cash balance untouched.",
            );
          }
        } else if (snapshot.cashBalances.length > 1) {
          warnings.push(
            "Multiple cash currencies detected. Cash balance untouched.",
          );
        } else {
          warnings.push(
            "No valid cash balance detected. Cash balance untouched.",
          );
        }
      }

      // 6d. Allocation recomputation
      if (investmentProjectionChanged) {
        const finalInvestments = await tx.investment.findMany({
          where: { userId },
        });
        const totalMarketValue = finalInvestments.reduce(
          (sum, inv) => sum + inv.marketValue,
          0,
        );

        for (const inv of finalInvestments) {
          let newAllocation =
            totalMarketValue > 0
              ? (inv.marketValue / totalMarketValue) * 100
              : 0;
          await tx.investment.update({
            where: { id: inv.id },
            data: { allocation: newAllocation },
          });
        }
      }
    });

    revalidatePath("/");
    revalidatePath("/investments");
    revalidatePath("/reports");

    return { success: true, warnings };
  });
