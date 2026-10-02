import { getWorkspaceUser } from "@/lib/workspace-user";
import { HomePage } from "@/components/HomePage";
import {
  getStatsForUser,
} from "@/lib/services/jobs.service";
import {
  getDashboardActions,
  getDashboardInterviews,
  getDashboardJobPreview,
  getDashboardReminders,
  getDataQualityItems,
  getWorkspacePreferences,
} from "@/lib/services/workspace.service";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getWorkspaceUser();
  const [jobs, reminders, interviews, stats, preferences, actions, quality] = await Promise.all([
    getDashboardJobPreview(user.id),
    getDashboardReminders(user.id),
    getDashboardInterviews(user.id),
    getStatsForUser(user.id),
    getWorkspacePreferences(user.id),
    getDashboardActions(user.id),
    getDataQualityItems(user.id),
  ]);

  return (
    <HomePage
      userId={user.id}
      userName={user.name || "Sobat"}
      initialData={{ jobs, jobTotal: stats.totalApplications, reminders, interviews, stats, preferences, actions, quality }}
    />
  );
}
