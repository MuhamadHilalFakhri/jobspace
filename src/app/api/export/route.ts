import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { exportJobs } from "@/lib/services/documents.service";

export const dynamic = "force-dynamic";

/** GET /api/export?format=csv|json (FR-09). */
export const GET = withUser(async (user, req: NextRequest) => {
  const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();
  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: "Format tidak didukung. Gunakan format=csv atau format=json." },
      { status: 400 },
    );
  }
  const result = await exportJobs(user.id, format);
  return new NextResponse(result.content, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
});
