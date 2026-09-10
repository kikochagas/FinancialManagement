import { getReportsData, getSubmittedReportsHistory } from "@/features/reports/queries";
import { ReportsClient } from "@/features/reports/reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [data, snapshotHistory] = await Promise.all([
    getReportsData(),
    getSubmittedReportsHistory(),
  ]);
  
  return <ReportsClient data={data} snapshotHistory={snapshotHistory} />;
}
