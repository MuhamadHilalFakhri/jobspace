import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { scheduleFollowUpSweep } from "@/lib/follow-up-scheduler";
import {
  addCommunication,
  createJob,
  deleteJob,
  getJobDetail,
  listJobsForUser,
  updateJob,
} from "@/lib/services/jobs.service";
import {
  communicationSchema,
  createJobSchema,
  jobFilterSchema,
  patchJobSchema,
} from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/jobs — list with search/filter/pagination (FR-01, FR-07). */
export const GET = withUser(async (user, req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = jobFilterSchema.parse(params);
  scheduleFollowUpSweep(user.id);
  const { archived, ...rest } = filters;
  const { items, total } = await listJobsForUser(user.id, {
    ...rest,
    archivedOnly: archived,
  });
  return NextResponse.json({
    items,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  });
});

/** POST /api/jobs — create application (FR-01). */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();
  const input = createJobSchema.parse(body);
  const job = await createJob(user.id, input);
  return NextResponse.json(job, { status: 201 });
});

export { };
