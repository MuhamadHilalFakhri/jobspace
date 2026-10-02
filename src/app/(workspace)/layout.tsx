import { getWorkspaceUser } from "@/lib/workspace-user";
import { listPages } from "@/lib/services/jobs.service";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { scheduleFollowUpSweep } from "@/lib/follow-up-scheduler";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getWorkspaceUser();
  scheduleFollowUpSweep(user.id);
  const initialPages = await listPages(user.id);

  return (
    <WorkspaceShell
      userName={user.name}
      workspaceName={user.workspaceName}
      initialPages={initialPages}
    >
      {children}
    </WorkspaceShell>
  );
}
