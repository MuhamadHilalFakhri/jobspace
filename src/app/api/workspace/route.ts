import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { readBoundedRequest } from "@/lib/bounded-request";
import { workspacePreferencesPatchSchema } from "@/lib/domain/validation";
import { getWorkspacePreferences, updateWorkspacePreferences } from "@/lib/services/workspace.service";

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  return NextResponse.json(await getWorkspacePreferences(user.id));
});

export const PATCH = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 16 * 1024)).json();
  const patch = workspacePreferencesPatchSchema.parse(body);
  return NextResponse.json(await updateWorkspacePreferences(user.id, patch));
});
