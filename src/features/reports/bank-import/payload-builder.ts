import { ParsedBankTransaction } from "./types";

export function buildImportPayload(
  accountId: string,
  updateBalance: boolean,
  endingBalance: number | null,
  transactions: (ParsedBankTransaction & { import?: boolean, categoryId?: string })[]
) {
  const toImport = transactions.filter(t => t.import && t.valid);

  return {
    accountId,
    updateBalance,
    endingBalance: updateBalance ? (endingBalance ?? undefined) : undefined,
    transactions: toImport.map(t => ({
      bookingDate: t.bookingDate!,
      description: t.description,
      amount: t.amount!,
      direction: t.direction as "Debit" | "Credit",
      categoryId: t.categoryId,
      forceImportDuplicate: t.isProbableDuplicate && t.import ? true : false,
      currency: t.currency ?? null,
    }))
  };
}
