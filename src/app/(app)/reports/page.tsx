import { getReportsData } from "@/features/reports/queries";
import { ReportsClient } from "@/features/reports/reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getReportsData();
  return <ReportsClient data={data} />;
}
