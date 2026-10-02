import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  deleteJob,
  getJobDetail,
  updateJob,
  restoreJobById,
} from "@/lib/services/jobs.service";
import { patchJobSchema, restoreJobSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/jobs/{id} — full detail incl. communications, history, reminders. */
export const GET = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const detail = await getJobDetail(user.id, id);
  return NextResponse.json(detail);
});

/** PATCH /api/jobs/{id} — inline edit + status transition (FR-01) or restore from archive. */
export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();

  if (body && typeof body === "object" && "restore" in body) {
    restoreJobSchema.parse(body);
    await restoreJobById(user.id, id);
    return NextResponse.json({ ok: true, restored: true });
  }

  const patch = patchJobSchema.parse(body);
  const job = await updateJob(user.id, id, patch);
  return NextResponse.json(job);
});

/** DELETE /api/jobs/{id} — soft delete (FR-01); ?purge=true for permanent deletion. */
export const DELETE = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const purge = req.nextUrl.searchParams.get("purge") === "true";
  await deleteJob(user.id, id, { purge });
  return NextResponse.json({ ok: true, purged: purge });
});
