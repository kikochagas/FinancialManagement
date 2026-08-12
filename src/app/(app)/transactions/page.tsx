import { getTransactionsData } from "@/features/transactions/queries";
import { TransactionsClient } from "@/features/transactions/transactions-client";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const data = await getTransactionsData();
  return <TransactionsClient data={data} />;
}
