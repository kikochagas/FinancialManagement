/**
 * This script is a one-off legacy transaction-domain migration utility. 
 * It is not required for new installations or the current Turso deployment.
 * Its purpose is ONLY migrating older databases created before the current
 * Debit/Credit/InternalTransfer direction model and the modern Category model.
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { ensureDefaultCategories } from "../src/features/categories/default-categories";

// SAFETY GUARD FOR HOSTED/TURSO ENVIRONMENTS
if (
  process.env.TURSO_DATABASE_URL || 
  process.env.TURSO_AUTH_TOKEN || 
  process.env.RENDER
) {
  console.error("ERROR: This legacy migration script is intended for local/explicit legacy database migration and must not run against the hosted Turso demo database.");
  process.exit(1);
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("file:")) {
  console.error("ERROR: A local SQLite DATABASE_URL starting with 'file:' is required.");
  process.exit(1);
}

const prisma = new PrismaClient();

export async function backfillTransactions(dryRun = false, prismaClient: any = prisma) {
  console.log(`Starting backfill/migration ${dryRun ? "(DRY RUN)" : ""}...`);
  
  const users = await prismaClient.user.findMany({ select: { id: true } });
  console.log(`Found ${users.length} users. Ensuring default categories...`);
  
  if (!dryRun) {
    for (const user of users) {
      await ensureDefaultCategories(user.id, prismaClient);
    }
  }

  const transactions = await prismaClient.transaction.findMany();
  console.log(`Found ${transactions.length} total transactions to process.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const tx of transactions) {
    let newDirection = tx.direction;
    let newCategoryId = tx.categoryId;

    const legacyType = tx.direction.toLowerCase();
    
    // Check if it's already a modern direction
    if (legacyType === "debit" || legacyType === "credit" || legacyType === "internaltransfer") {
      // Fix modern partial migrations with null categories
      if (!newCategoryId) {
        if (legacyType === "internaltransfer") {
          newCategoryId = await getDefaultCategory(tx.userId, "transfer", dryRun, prismaClient);
        } else {
          newCategoryId = await getDefaultCategory(tx.userId, "uncategorized", dryRun, prismaClient);
        }
      }

      if (tx.categoryId !== newCategoryId) {
        if (!dryRun) {
          await prismaClient.transaction.update({
            where: { id: tx.id },
            data: { categoryId: newCategoryId }
          });
        }
        updatedCount++;
      } else {
        skippedCount++;
      }
      continue;
    }

    // Determine new direction based on VERIFIED historical semantics
    if (legacyType === "income") {
      newDirection = "Credit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "uncategorized", dryRun, prismaClient);
    } else if (legacyType === "expense") {
      newDirection = "Debit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "uncategorized", dryRun, prismaClient);
    } else if (legacyType === "interest") {
      newDirection = "Credit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "interest", dryRun, prismaClient);
    } else if (legacyType === "tax") {
      newDirection = "Debit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "tax", dryRun, prismaClient);
    } else if (legacyType === "investment") {
      newDirection = "Debit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "investment", dryRun, prismaClient);
    } else if (legacyType === "transfer") {
      if (tx.destinationAccountId) {
        newDirection = "InternalTransfer";
        if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "transfer", dryRun, prismaClient);
      } else {
        newDirection = "Debit";
        if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "transfer", dryRun, prismaClient);
      }
    } else {
      // Unknown type
      newDirection = "Debit";
      if (!newCategoryId) newCategoryId = await getDefaultCategory(tx.userId, "uncategorized", dryRun, prismaClient);
    }

    if (tx.direction !== newDirection || tx.categoryId !== newCategoryId) {
      if (!dryRun) {
        await prismaClient.transaction.update({
          where: { id: tx.id },
          data: {
            direction: newDirection,
            categoryId: newCategoryId,
          }
        });
      }
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`Migration Complete. Updated: ${updatedCount}, Skipped/Already Migrated: ${skippedCount}`);
}

export async function getDefaultCategory(userId: string, systemKey: string, dryRun: boolean, prismaClient: any = prisma) {
  const cat = await prismaClient.category.findFirst({
    where: { userId, systemKey }
  });
  if (cat) return cat.id;
  
  if (dryRun) {
    // Return a dummy value during dryRun to correctly simulate that it WOULD be assigned
    return `DRY_RUN_ID_${systemKey}`;
  }
  return null;
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.endsWith('backfill-existing-users.ts'))) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  backfillTransactions(dryRun)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
