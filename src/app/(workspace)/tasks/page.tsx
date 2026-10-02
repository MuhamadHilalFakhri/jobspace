import { TasksClient } from "@/components/TasksClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listTasks } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getWorkspaceUser();
  const items = await listTasks(user.id);
  return <TasksClient initialItems={items} />;
}
