import { QueryProvider } from "@/components/layout/query-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getUserId();
  if (!userId) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!user) {
    redirect("/login");
  }

  const accounts = await db.account.findMany({ where: { userId } });
  const netWorth = accounts.reduce((acc, a) => acc + a.balance, 0);

  return (
    <QueryProvider>
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <Header netWorth={netWorth} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </QueryProvider>
  );
}
