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
