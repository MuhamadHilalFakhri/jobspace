import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { globalSearch } from "@/lib/services/jobs.service";
import { universalSearchQuerySchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

/** GET /api/search?q= — universal search across the user's workspace. */
export const GET = withUser(async (user, req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) {
    return NextResponse.json({
      jobs: [],
      opportunities: [],
      pages: [],
      companies: [],
      tasks: [],
    });
  }
  const query = universalSearchQuerySchema.safeParse(q);
  if (!query.success) return NextResponse.json({ error: "Pencarian maksimal 100 karakter." }, { status: 400 });
  const results = await globalSearch(user.id, query.data);
  return NextResponse.json(results);
});
