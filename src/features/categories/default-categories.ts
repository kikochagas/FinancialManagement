import { db } from "@/lib/db";

export const DEFAULT_CATEGORIES = [
  { name: "Salary", directionHint: "Credit", systemKey: "salary", color: "#22C55E", },
  { name: "Purchase", directionHint: "Debit", systemKey: "purchase", color: "#A855F7", },
  { name: "Withdrawal", directionHint: "Debit", systemKey: "withdrawal", color: "#64748B", },
  { name: "Transfer", directionHint: "Both", systemKey: "transfer", color: "#3B82F6", },
  { name: "Investment", directionHint: "Both", systemKey: "investment", color: "#14B8A6" },
  { name: "Interest", directionHint: "Both", systemKey: "interest", color: "#EAB308", },
  { name: "Tax", directionHint: "Debit", systemKey: "tax", color: "#EF4444", },
  { name: "Fees", directionHint: "Debit", systemKey: "fees", color: "#F97316", },
  { name: "Groceries", directionHint: "Debit", systemKey: "groceries", color: "#10B981", },
  { name: "Travel", directionHint: "Debit", systemKey: "travel", color: "#06B6D4", },
  { name: "Entertainment", directionHint: "Debit", systemKey: "entertainment", color: "#8B5CF6", },
  { name: "Uncategorized", directionHint: "Both", systemKey: "uncategorized", color: "#9CA3AF", },
];

/**
 * Idempotently creates default categories for a user.
 * Avoids duplicates by checking existing systemKeys or names.
 */
export async function ensureDefaultCategories(userId: string) {
  const existingCategories = await db.category.findMany({
    where: { userId }
  });

  const existingKeys = new Set(existingCategories.map(c => c.systemKey).filter(Boolean));
  const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()));

  for (const cat of DEFAULT_CATEGORIES) {
    // Skip if systemKey exists or a category with the same exact name exists
    if (existingKeys.has(cat.systemKey) || existingNames.has(cat.name.toLowerCase())) {
      continue;
    }

    await db.category.create({
      data: {
        userId,
        name: cat.name,

        directionHint: cat.directionHint,
        systemKey: cat.systemKey,
        color: cat.color,
      }
    });
  }
}
