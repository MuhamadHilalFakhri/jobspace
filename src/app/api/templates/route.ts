import { NextRequest, NextResponse } from "next/server";
import { withUser, withApi } from "@/lib/api";
import {
  createTemplate,
  listTemplates,
} from "@/lib/services/jobs.service";
import { templateSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/templates (FR-09). */
export const GET = withUser(async (user) => {
  const items = await listTemplates(user.id);
  return NextResponse.json({ items });
});

/** POST /api/templates (FR-09). */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 64 * 1024)).json();
  const input = templateSchema.parse(body);
  const template = await createTemplate(user.id, input);
  return NextResponse.json(template, { status: 201 });
});
