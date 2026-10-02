import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { updateInterview } from "@/lib/services/jobs.service";
import { interviewPatchSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/interviews/{id} — update schedule/result (FR-06). */
export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const patch = interviewPatchSchema.parse(body);
  await updateInterview(user.id, id, patch);
  return NextResponse.json({ ok: true });
});
