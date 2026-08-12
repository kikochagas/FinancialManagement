import { getDashboardData } from "@/features/dashboard/queries";
import { DashboardClient } from "@/features/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
