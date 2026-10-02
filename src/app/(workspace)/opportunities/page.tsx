import { OpportunitiesClient } from "@/components/OpportunitiesClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listOpportunities } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const user = await getWorkspaceUser();
  const items = await listOpportunities(user.id);
  return <OpportunitiesClient initialItems={items} />;
}
