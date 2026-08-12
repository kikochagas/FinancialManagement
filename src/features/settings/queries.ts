import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function getSettingsData() {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");

  let settings = await db.settings.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await db.settings.create({
      data: {
        userId,
        theme: "Dark",
        currency: "EUR",
        language: "English",
      },
    });
  }

  return {
    settings: {
      theme: settings.theme,
      currency: settings.currency,
      language: settings.language,
    },
  };
}
