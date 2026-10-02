import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { updateCommunication } from "@/lib/services/jobs.service";
import { patchCommunicationSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; communicationId: string }> };

export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id, communicationId } = await params;
  uuidSchema.parse(id);
  uuidSchema.parse(communicationId);
  const body = await (await readBoundedRequest(req, 16 * 1024)).json();
  const patch = patchCommunicationSchema.parse(body);
  await updateCommunication(user.id, id, communicationId, patch);
  return NextResponse.json({ ok: true });
});
