import { RemindersClient } from "@/components/RemindersClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listRemindersForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const user = await getWorkspaceUser();
  const items = await listRemindersForUser(user.id, "aktif");
  return <RemindersClient initialItems={items} />;
}
