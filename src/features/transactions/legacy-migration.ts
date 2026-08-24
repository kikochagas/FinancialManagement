import { db } from "@/lib/db";
import { z } from "zod";

export const DirectionSchema = z.enum(["Debit", "Credit"]);
export type TransactionDirection = z.infer<typeof DirectionSchema>;

export const CategoryDirectionHintSchema = z.enum(["Debit", "Credit", "Both"]);
export type CategoryDirectionHint = z.infer<typeof CategoryDirectionHintSchema>;

export const DEFAULT_CATEGORIES = [
  { name: "Salary", systemKey: "salary", directionHint: "Credit", type: "Income", color: "#10b981" }, // Emerald 500
  { name: "Purchase", systemKey: "purchase", directionHint: "Debit", type: "Expense", color: "#f43f5e" }, // Rose 500
  { name: "Withdrawal", systemKey: "withdrawal", directionHint: "Debit", type: "Expense", color: "#64748b" }, // Slate 500
  { name: "Transfer", systemKey: "transfer", directionHint: "Both", type: "Expense", color: "#8b5cf6" }, // Violet 500
  { name: "Investment", systemKey: "investment", directionHint: "Both", type: "Expense", color: "#3b82f6" }, // Blue 500
  { name: "Interest", systemKey: "interest", directionHint: "Both", type: "Income", color: "#14b8a6" }, // Teal 500
  { name: "Tax", systemKey: "tax", directionHint: "Debit", type: "Expense", color: "#ef4444" }, // Red 500
  { name: "Fees", systemKey: "fees", directionHint: "Debit", type: "Expense", color: "#f97316" }, // Orange 500
  { name: "Groceries", systemKey: "groceries", directionHint: "Debit", type: "Expense", color: "#84cc16" }, // Lime 500
  { name: "Travel", systemKey: "travel", directionHint: "Debit", type: "Expense", color: "#0ea5e9" }, // Sky 500
  { name: "Entertainment", systemKey: "entertainment", directionHint: "Debit", type: "Expense", color: "#d946ef" }, // Fuchsia 500
  { name: "Uncategorized", systemKey: "uncategorized", directionHint: "Both", type: "Expense", color: "#9ca3af" } // Gray 400
];

/**
 * Idempotently creates default categories for a user.
 */
export async function ensureDefaultCategories(userId: string) {
  const existingCategories = await db.category.findMany({
    where: { userId, systemKey: { not: null } }
  });

  const existingKeys = new Set(existingCategories.map(c => c.systemKey));

  const toCreate = DEFAULT_CATEGORIES.filter(dc => !existingKeys.has(dc.systemKey));

  if (toCreate.length > 0) {
    await db.category.createMany({
      data: toCreate.map(dc => ({
        ...dc,
        userId
      }))
    });
  }
}

/**
 * Compatibility helper to derive legacy 'type' from 'direction' when required by DB schema.
 */
export function directionToLegacyType(direction: string): string {
  if (direction === "Credit") return "Income";
  return "Expense"; // Debit
}

export function directionToLegacyCategoryType(direction: string): string {
  if (direction === "Credit") return "Income";
  return "Expense";
}
