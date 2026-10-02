import { ApplicationsClient } from "@/components/ApplicationsClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listJobsForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const user = await getWorkspaceUser();
  const result = await listJobsForUser(user.id, {
    page: 1,
    pageSize: 20,
    sort: "updatedAt",
    order: "desc",
  });
  return <ApplicationsClient initialData={{ items: result.items, total: result.total }} />;
}
