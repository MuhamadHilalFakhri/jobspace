import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  createInterview,
  listInterviewsForUser,
} from "@/lib/services/jobs.service";
import { interviewSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/interviews?jobId= — list (FR-06). */
export const GET = withUser(async (user, req: NextRequest) => {
  const jobId = req.nextUrl.searchParams.get("jobId") || undefined;
  if (jobId && !uuidSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: "ID lamaran tidak valid" }, { status: 400 });
  }
  const items = await listInterviewsForUser(user.id, jobId);
  return NextResponse.json({ items });
});

export type Params = { params: Promise<{ id: string }> };

/** POST /api/interviews?jobId= — schedule (FR-06). */
export const POST = withUser(async (user, req: NextRequest) => {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId wajib disertakan" }, { status: 400 });
  }
  if (!uuidSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: "ID lamaran tidak valid" }, { status: 400 });
  }
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const input = interviewSchema.parse(body);
  const created = await createInterview(user.id, jobId, input);
  return NextResponse.json(created, { status: 201 });
});
