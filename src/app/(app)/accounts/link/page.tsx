import { redirect } from "next/navigation";
import { getPendingAccountsForConnection } from "@/features/accounts/queries";
import { LinkAccountsClient } from "@/features/accounts/components/link-client";

export default async function LinkAccountsPage({ searchParams }: { searchParams: Promise<{ connectionId?: string }> }) {
  const { connectionId } = await searchParams;

  if (!connectionId) {
    redirect("/accounts?error=missing_connection");
  }

  try {
    const data = await getPendingAccountsForConnection(connectionId);
    
    // If no valid pending accounts and no existing mappings exist, redirect safely
    if (data.pendingAccounts.length === 0 && data.existingMappings.length === 0) {
      redirect("/accounts?message=no_pending_accounts");
    }

    // Pass only application-safe info to UI
    const fakePendingFromMappings = data.existingMappings.map((m) => ({
      id: `mapping-${m.id}`,
      displayName: m.account.name,
      maskedIdentifier: null,
      currency: m.account.currency,
      cashAccountType: null,
      isAlreadyLinked: true,
      linkedAccountName: m.account.name
    }));

    const safePendingAccounts = [
      ...fakePendingFromMappings,
      ...data.pendingAccounts.map((acc) => ({
        id: acc.id,
        displayName: acc.displayName,
        maskedIdentifier: acc.maskedIdentifier,
        currency: acc.currency,
        cashAccountType: acc.cashAccountType,
        isAlreadyLinked: false,
        linkedAccountName: null
      }))
    ];

    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-8 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Connect Accounts</h1>
          <p className="text-muted-foreground text-sm">
            {data.connection.institutionName} connected successfully. Select which accounts you want to track.
          </p>
        </div>

        <LinkAccountsClient 
          connectionId={connectionId}
          pendingAccounts={safePendingAccounts}
          existingAccounts={data.existingAccounts}
          institutionName={data.connection.institutionName}
        />
      </div>
    );
  } catch (error) {
    redirect("/accounts?error=unauthorized_or_expired");
  }
}
