import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { addCommunication } from "@/lib/services/jobs.service";
import { communicationSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/jobs/{id}/communications — add entry (FR-03). */
export const POST = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const input = communicationSchema.parse(body);
  const entry = await addCommunication(user.id, id, input);
  return NextResponse.json(entry, { status: 201 });
});
