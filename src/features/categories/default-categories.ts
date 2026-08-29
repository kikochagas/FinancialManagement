import { Category, Prisma } from "@prisma/client";

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

export interface CategoryClient {
  category: {
    findMany(args?: Prisma.CategoryFindManyArgs): Promise<Category[]>;
    create(args: Prisma.CategoryCreateArgs): Promise<Category>;
    update(args: Prisma.CategoryUpdateArgs): Promise<Category>;
  };
}

/**
 * Idempotently creates default categories for a user.
 * Avoids duplicates by checking existing systemKeys or names.
 */
export async function ensureDefaultCategories(userId: string, client?: CategoryClient): Promise<Category[]> {
  const resolvedClient = client ?? (await import("@/lib/db")).db;

  const existingCategories = await resolvedClient.category.findMany({
    where: { userId }
  });

  const existingKeys = new Set(existingCategories.map((c) => c.systemKey).filter(Boolean));
  const existingNames = new Map<string, Category>(
    existingCategories.map((c) => [c.name.toLowerCase(), c])
  );

  for (const cat of DEFAULT_CATEGORIES) {
    // 1. If exact systemKey already exists, we are good
    if (existingKeys.has(cat.systemKey)) {
      continue;
    }

    // 2. If a category with the same name exists, adopt it if it doesn't already have a conflicting systemKey
    const existingByName = existingNames.get(cat.name.toLowerCase());
    if (existingByName) {
      if (!existingByName.systemKey || existingByName.systemKey === cat.systemKey) {
        await resolvedClient.category.update({
          where: { id: existingByName.id },
          data: {
            systemKey: cat.systemKey,
            directionHint: cat.directionHint,
          }
        });
        existingKeys.add(cat.systemKey);
        continue;
      } else {
        // Leave the existing row unchanged, do not attempt duplicate creation.
        continue;
      }
    }

    // 3. Otherwise, create a new one
    await resolvedClient.category.create({
      data: {
        userId,
        name: cat.name,
        directionHint: cat.directionHint,
        systemKey: cat.systemKey,
        color: cat.color,
      }
    });
  }

  return await resolvedClient.category.findMany({
    where: { userId }
  });
}
