import { PrismaClient } from "@prisma/client";
import { ensureDefaultCategories } from "../src/features/categories/default-categories";

const prisma = new PrismaClient();

async function backfillTransactions(dryRun = false) {
  console.log(`Starting backfill/migration ${dryRun ? "(DRY RUN)" : ""}...`);
  // NOTE: This backfill script assumes the Prisma schema currently stores `direction`
  // as a String (instead of a Prisma Enum). This is an intermediate upgrade assumption 
  // that allows the `direction` column to temporarily hold legacy types (like 'Income', 
  // 'Expense', 'Transfer') before they are migrated to 'Credit', 'Debit', and 'InternalTransfer'.

  // 1. Ensure default categories are present
  const users = await prisma.user.findMany({ select: { id: true } });
  console.log(`Found ${users.length} users. Ensuring default categories...`);
  
  if (!dryRun) {
    for (const user of users) {
      await ensureDefaultCategories(user.id);
    }
  }

  // 2. Fetch all legacy transactions
  // They are currently in DB with direction as 'Income' | 'Expense' | 'Transfer' | etc.
  // Note: Since Prisma schema already treats direction as String, we can query it easily.
  const transactions = await prisma.transaction.findMany();
  
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
          newCategoryId = await getDefaultCategory(tx.userId, "transfer");
        } else {
          newCategoryId = await getDefaultCategory(tx.userId, "uncategorized");
        }
      }

      if (tx.categoryId !== newCategoryId) {
        if (!dryRun) {
          await prisma.transaction.update({
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
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "uncategorized");
      }
    } else if (legacyType === "expense") {
      newDirection = "Debit";
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "uncategorized");
      }
    } else if (legacyType === "interest") {
      newDirection = "Credit";
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "interest");
      }
    } else if (legacyType === "tax") {
      newDirection = "Debit";
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "tax");
      }
    } else if (legacyType === "investment") {
      newDirection = "Debit";
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "investment");
      }
    } else if (legacyType === "transfer") {
      if (tx.destinationAccountId) {
        newDirection = "InternalTransfer";
        if (!newCategoryId) {
          newCategoryId = await getDefaultCategory(tx.userId, "transfer");
        }
      } else {
        newDirection = "Debit";
        if (!newCategoryId) {
          newCategoryId = await getDefaultCategory(tx.userId, "transfer");
        }
      }
    } else {
      // Unknown type
      newDirection = "Debit";
      if (!newCategoryId) {
        newCategoryId = await getDefaultCategory(tx.userId, "uncategorized");
      }
    }

    if (tx.direction !== newDirection || tx.categoryId !== newCategoryId) {
      if (!dryRun) {
        await prisma.transaction.update({
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

async function getDefaultCategory(userId: string, systemKey: string) {
  const cat = await prisma.category.findFirst({
    where: { userId, systemKey }
  });
  return cat ? cat.id : null;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

backfillTransactions(dryRun)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
