import { db } from "@/lib/db";

export const DEFAULT_CATEGORIES = [
  { name: "Salary", directionHint: "Credit", systemKey: "salary", color: "#22C55E", type: "Income" },
  { name: "Purchase", directionHint: "Debit", systemKey: "purchase", color: "#A855F7", type: "Expense" },
  { name: "Withdrawal", directionHint: "Debit", systemKey: "withdrawal", color: "#64748B", type: "Expense" },
  { name: "Transfer", directionHint: "Both", systemKey: "transfer", color: "#3B82F6", type: "Transfer" },
  { name: "Investment", directionHint: "Both", systemKey: "investment", color: "#14B8A6", type: "Investment" },
  { name: "Interest", directionHint: "Both", systemKey: "interest", color: "#EAB308", type: "Interest" },
  { name: "Tax", directionHint: "Debit", systemKey: "tax", color: "#EF4444", type: "Tax" },
  { name: "Fees", directionHint: "Debit", systemKey: "fees", color: "#F97316", type: "Expense" },
  { name: "Groceries", directionHint: "Debit", systemKey: "groceries", color: "#10B981", type: "Expense" },
  { name: "Travel", directionHint: "Debit", systemKey: "travel", color: "#06B6D4", type: "Expense" },
  { name: "Entertainment", directionHint: "Debit", systemKey: "entertainment", color: "#8B5CF6", type: "Expense" },
  { name: "Uncategorized", directionHint: "Both", systemKey: "uncategorized", color: "#9CA3AF", type: "Expense" },
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
        type: cat.type, // legacy type to maintain db constraints for now
        directionHint: cat.directionHint,
        systemKey: cat.systemKey,
        color: cat.color,
      }
    });
  }
}
