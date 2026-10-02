import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { convertOpportunity } from "@/lib/services/jobs.service";
import { uuidSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const job = await convertOpportunity(user.id, id);
  return NextResponse.json(job, { status: 201 });
});
