export function applyCategorySuggestionsAndFallbacks<T extends { categoryId?: string }>(
  transactions: T[],
  duplicates: number[],
  categoriesMap: Record<number, string | null> | undefined,
  categories: { id: string; systemKey?: string | null }[]
): (T & { isProbableDuplicate?: boolean; import?: boolean; isCategorySuggested?: boolean })[] {
  const uncat = categories.find(c => c.systemKey === "uncategorized");

  return transactions.map((t, i) => {
    let updated = { ...t } as any;

    if (duplicates.includes(i)) {
      updated.isProbableDuplicate = true;
      updated.import = false;
    }

    if (categoriesMap && categoriesMap[i] && !updated.categoryId) {
      updated.categoryId = categoriesMap[i];
      updated.isCategorySuggested = true;
    } else if (!updated.categoryId && uncat) {
      updated.categoryId = uncat.id;
    }

    return updated;
  });
}
