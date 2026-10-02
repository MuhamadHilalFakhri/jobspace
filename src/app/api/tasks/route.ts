import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/lib/services/jobs.service";
import { createTaskSchema, taskFilterSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/tasks?jobId=&status= */
export const GET = withUser(async (user, req: NextRequest) => {
  const filters = taskFilterSchema.parse({
    jobId: req.nextUrl.searchParams.get("jobId") || undefined,
    status: req.nextUrl.searchParams.get("status") || undefined,
  });
  const items = await listTasks(user.id, filters);
  return NextResponse.json({ items });
});

/** POST /api/tasks */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 16 * 1024)).json();
  const input = createTaskSchema.parse(body);
  const id = await createTask(user.id, input);
  return NextResponse.json({ id }, { status: 201 });
});
