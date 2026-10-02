import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { deleteTemplate, updateTemplate } from "@/lib/services/jobs.service";
import { templateSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/templates/{id} (FR-09). */
export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();
  const patch = templateSchema.partial().parse(body);
  await updateTemplate(user.id, id, patch);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/templates/{id} — soft delete (FR-09). */
export const DELETE = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  await deleteTemplate(user.id, id);
  return NextResponse.json({ ok: true });
});
