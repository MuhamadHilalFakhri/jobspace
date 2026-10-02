import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { readBoundedRequest } from "@/lib/bounded-request";
import { patchReminderSchema, uuidSchema } from "@/lib/domain/validation";
import { updateReminderForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 8 * 1024)).json();
  const patch = patchReminderSchema.parse(body);
  await updateReminderForUser(user.id, id, patch.dueDate);
  return NextResponse.json({ ok: true });
});
