import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { updateTask, deleteTask } from "@/lib/services/jobs.service";
import { patchTaskSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 16 * 1024)).json();
  const input = patchTaskSchema.parse(body);
  const { completed, ...rest } = input;
  await updateTask(user.id, id, {
    ...rest,
    completedAt: completed === undefined ? undefined : completed ? new Date().toISOString() : null,
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  await deleteTask(user.id, id);
  return NextResponse.json({ ok: true });
});
