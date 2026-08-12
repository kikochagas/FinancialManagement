import { getAccountsData } from "@/features/accounts/queries";
import { AccountsClient } from "@/features/accounts/accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const data = await getAccountsData();
  return <AccountsClient data={data} />;
}
