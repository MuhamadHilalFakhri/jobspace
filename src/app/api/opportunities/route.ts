import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  convertOpportunity,
  createOpportunity,
  listOpportunities,
} from "@/lib/services/jobs.service";
import { createOpportunitySchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/opportunities */
export const GET = withUser(async (user) => {
  const items = await listOpportunities(user.id);
  return NextResponse.json({ items });
});

/** POST /api/opportunities */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();
  const input = createOpportunitySchema.parse(body);
  const id = await createOpportunity(user.id, input);
  return NextResponse.json({ id }, { status: 201 });
});

/** PUT /api/opportunities — convert to application (query: id) */
export const PUT = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  uuidSchema.parse(id);
  const job = await convertOpportunity(user.id, id);
  return NextResponse.json({ job });
});
