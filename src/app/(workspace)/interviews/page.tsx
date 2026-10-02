import { InterviewsClient } from "@/components/InterviewsClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listInterviewsForUser, listJobsForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const user = await getWorkspaceUser();
  const [items, jobs] = await Promise.all([
    listInterviewsForUser(user.id),
    listJobsForUser(user.id, {
      page: 1,
      pageSize: 100,
      sort: "updatedAt",
      order: "desc",
    }),
  ]);
  return <InterviewsClient initialData={{ items, jobs: jobs.items }} />;
}
