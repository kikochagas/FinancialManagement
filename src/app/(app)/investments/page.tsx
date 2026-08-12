import { getInvestmentsData } from "@/features/investments/queries";
import { InvestmentsClient } from "@/features/investments/investments-client";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const data = await getInvestmentsData();
  return <InvestmentsClient data={data} />;
}
