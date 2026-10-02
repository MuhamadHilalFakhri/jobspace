import { ArchiveClient } from "@/components/ArchiveClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listJobsForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getWorkspaceUser();
  const result = await listJobsForUser(user.id, {
    page: 1,
    pageSize: 100,
    sort: "updatedAt",
    order: "desc",
    archivedOnly: true,
  });
  return <ArchiveClient initialItems={result.items} />;
}
