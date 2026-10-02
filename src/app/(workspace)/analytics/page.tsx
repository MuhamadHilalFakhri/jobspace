import { AnalyticsClient } from "@/components/AnalyticsClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { getStatsForUser } from "@/lib/services/jobs.service";
import { getAnalyticsInsights } from "@/lib/services/insights.service";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getWorkspaceUser();
  const [stats, insights] = await Promise.all([
    getStatsForUser(user.id),
    getAnalyticsInsights(user.id, 12),
  ]);
  return <AnalyticsClient initialStats={stats} initialInsights={insights} />;
}
