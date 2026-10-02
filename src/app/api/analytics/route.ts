import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getStatsForUser } from "@/lib/services/jobs.service";
import { getAnalyticsInsights } from "@/lib/services/insights.service";

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: NextRequest) => {
  const rawWeeks = Number(req.nextUrl.searchParams.get("weeks") ?? 12);
  const weeks = [4, 12, 26].includes(rawWeeks) ? rawWeeks : 12;
  const [stats, insights] = await Promise.all([
    getStatsForUser(user.id),
    getAnalyticsInsights(user.id, weeks),
  ]);
  return NextResponse.json({ stats, insights });
});
