import { DocumentsClient } from "@/components/DocumentsClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listJobsForUser } from "@/lib/services/jobs.service";
import { listDocuments } from "@/lib/services/documents.service";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await getWorkspaceUser();
  const [docs, jobs] = await Promise.all([
    listDocuments(user.id),
    listJobsForUser(user.id, {
      page: 1,
      pageSize: 100,
      sort: "updatedAt",
      order: "desc",
    }),
  ]);
  return <DocumentsClient initialData={{ docs, jobs: jobs.items }} />;
}
