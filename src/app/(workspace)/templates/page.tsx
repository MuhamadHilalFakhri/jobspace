import { TemplatesClient } from "@/components/TemplatesClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listTemplates } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getWorkspaceUser();
  const items = await listTemplates(user.id);
  return <TemplatesClient initialItems={items} />;
}
