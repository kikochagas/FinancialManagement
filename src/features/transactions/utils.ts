export function buildTransactionPayload(formState: any) {
  const isTransfer = formState.direction === "InternalTransfer";
  return {
    description: formState.description,
    amount: Number(formState.amount),
    date: formState.date,
    direction: formState.direction as "Debit" | "Credit" | "InternalTransfer",
    accountId: formState.accountId === "none" ? undefined : formState.accountId,
    categoryId: formState.categoryId || null,
    destinationAccountId: isTransfer && formState.destinationAccountId ? formState.destinationAccountId : null,
    tags: formState.tags || "",
    notes: formState.notes || "",
  };
}


export function getTransactionPerspective(tx: { direction: string, accountId: string, destinationAccountId: string }, filterId: string) {
  if (tx.direction === "InternalTransfer") {
    if (filterId === tx.accountId) return { type: "outgoing", sign: "-", color: "text-foreground" };
    if (filterId === tx.destinationAccountId) return { type: "incoming", sign: "+", color: "text-emerald-500 dark:text-emerald-400" };
    return { type: "neutral", sign: "⇄ ", color: "text-blue-500 dark:text-blue-400" };
  }
  if (tx.direction === "Credit") return { type: "incoming", sign: "+", color: "text-emerald-500 dark:text-emerald-400" };
  return { type: "outgoing", sign: "-", color: "text-foreground" };
}

export function filterTransactions(transactions: any[], filters: { search: string, directionFilter: string, accountFilter: string, categoryFilter: string }) {
  return transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(filters.search.toLowerCase()) ||
      tx.tags.toLowerCase().includes(filters.search.toLowerCase());
    const matchesDirection = filters.directionFilter === "all" || tx.direction === filters.directionFilter;
    const matchesAccount = filters.accountFilter === "all" || tx.accountId === filters.accountFilter || (tx.direction === "InternalTransfer" && tx.destinationAccountId === filters.accountFilter);
    const matchesCategory = filters.categoryFilter === "all" || tx.categoryId === filters.categoryFilter;
    return matchesSearch && matchesDirection && matchesAccount && matchesCategory;
  });
}
