import { createSafeActionClient } from "next-safe-action";
import { getUserId } from "@/lib/auth";

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    console.error("Action error:", e);
    return e instanceof Error ? e.message : "An unexpected server error occurred";
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const userId = await getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return next({ ctx: { userId } });
});
