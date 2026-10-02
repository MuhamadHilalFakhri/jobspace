import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { deleteOpportunity, updateOpportunity } from "@/lib/services/jobs.service";
import { patchOpportunitySchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();
  const patch = patchOpportunitySchema.parse(body);
  await updateOpportunity(user.id, id, patch);
  return NextResponse.json({ ok: true });
});

export const DELETE = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  await deleteOpportunity(user.id, id);
  return NextResponse.json({ ok: true });
});
