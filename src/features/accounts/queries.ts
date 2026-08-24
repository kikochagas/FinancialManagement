import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getAccountsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const accounts = await db.account.findMany({
    where: { userId },
    include: {
      transactions: {
        orderBy: { date: "desc" },
        take: 5,
        include: {
          category: true,
        },
      },
      externalMappings: {
        include: {
          bankConnection: true
        }
      },
    },
  });

  return {
    accounts: accounts.map((a) => {
      const activeMapping = a.externalMappings.find(m => m.disconnectedAt === null);
      const anyMapping = a.externalMappings.length > 0 ? a.externalMappings[0] : null;
      
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
        recentTransactions: a.transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString().split("T")[0],
          description: t.description,
          direction: t.direction,
          amount: t.amount,
          category: t.category?.name || "Uncategorized",
          color: t.category?.color || "#94a3b8",
        })),
        isBankConnected: !!activeMapping,
        hasBankHistory: a.externalMappings.length > 0,
        institutionName: activeMapping ? activeMapping.bankConnection.institutionName : (anyMapping ? anyMapping.bankConnection.institutionName : null),
        connectionStatus: activeMapping ? activeMapping.bankConnection.status : null,
        validUntil: activeMapping ? activeMapping.bankConnection.validUntil?.toISOString() || null : null,
        lastBalanceSyncedAt: activeMapping ? activeMapping.lastBalanceSyncedAt?.toISOString() || null : null,
        lastTransactionSyncedAt: activeMapping ? activeMapping.lastTransactionSyncedAt?.toISOString() || null : null,
      };
    }),
  };
}

export async function getPendingAccountsForConnection(connectionId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const connection = await db.bankConnection.findUnique({
    where: { id: connectionId },
    include: {
      pendingAccounts: {
        where: {
          expiresAt: { gt: new Date() }
        }
      }
    }
  });

  if (!connection || connection.userId !== userId) {
    throw new Error("Unauthorized");
  }

  // Also grab all existing accounts to let the user link
  const existingAccounts = await db.account.findMany({
    where: { userId },
    select: { id: true, name: true, currency: true, type: true }
  });

  // Fetch existing mappings to know if a pending account is already mapped
  const existingMappings = await db.externalAccountMapping.findMany({
    where: { bankConnectionId: connectionId },
    include: { account: true }
  });

  return {
    connection,
    pendingAccounts: connection.pendingAccounts,
    existingAccounts,
    existingMappings
  };
}
