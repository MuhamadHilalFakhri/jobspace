import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { completeReminderForUser } from "@/lib/services/jobs.service";
import { uuidSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/reminders/{id}/complete (FR-04). */
export const POST = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const result = await completeReminderForUser(user.id, id);
  return NextResponse.json({ ok: true, ...result });
});
