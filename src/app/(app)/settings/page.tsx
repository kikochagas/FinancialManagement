import { getSettingsData } from "@/features/settings/queries";
import { SettingsClient } from "@/features/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettingsData();
  return <SettingsClient data={data} />;
}
