import { getGoalsData } from "@/features/goals/queries";
import { GoalsClient } from "@/features/goals/goals-client";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const data = await getGoalsData();
  return <GoalsClient data={data} />;
}
