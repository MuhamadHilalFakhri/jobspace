import { CompaniesClient } from "@/components/CompaniesClient";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { listCompanies } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const user = await getWorkspaceUser();
  const items = await listCompanies(user.id);
  return <CompaniesClient initialItems={items} />;
}
