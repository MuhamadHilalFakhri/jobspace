import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getStatsForUser } from "@/lib/services/jobs.service";

export const dynamic = "force-dynamic";

/** GET /api/stats (FR-08). */
export const GET = withUser(async (user) => {
  const stats = await getStatsForUser(user.id);
  return NextResponse.json(stats);
});
