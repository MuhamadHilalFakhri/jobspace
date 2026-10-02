import { PageEditor } from "@/components/PageEditor";
import { getWorkspaceUser } from "@/lib/workspace-user";
import { getPageWithBlocks } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

export default async function PagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getWorkspaceUser();
  const initialPage = await getPageWithBlocks(user.id, id);
  return <PageEditor key={id} pageId={id} initialPage={initialPage} />;
}
