import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { listRemindersForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

/** GET /api/reminders?status=aktif|selesai (FR-04). */
export const GET = withUser(async (user, req: NextRequest) => {
  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "aktif" || statusParam === "selesai" ? statusParam : undefined;
  const items = await listRemindersForUser(user.id, status);
  return NextResponse.json({ items });
});
