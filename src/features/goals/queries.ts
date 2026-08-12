import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getGoalsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  const goals = await db.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return {
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progress: g.progress,
      estimatedCompletion: g.estimatedCompletion || "N/A",
    })),
  };
}
