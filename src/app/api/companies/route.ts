import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { createCompany, listCompanies } from "@/lib/services/jobs.service";
import { createCompanySchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/companies */
export const GET = withUser(async (user) => {
  const items = await listCompanies(user.id);
  return NextResponse.json({ items });
});

/** POST /api/companies */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const input = createCompanySchema.parse(body);
  const id = await createCompany(user.id, input);
  return NextResponse.json({ id }, { status: 201 });
});
