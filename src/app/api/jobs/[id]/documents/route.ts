import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  linkDocumentToJob,
  unlinkDocumentFromJob,
} from "@/lib/services/documents.service";
import { documentLinkSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/jobs/{id}/documents — link document to job (FR-05). */
export const POST = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const body = await (await readBoundedRequest(req, 4 * 1024)).json();
  const { documentId } = documentLinkSchema.parse(body);
  uuidSchema.parse(id);
  await linkDocumentToJob(user.id, id, documentId);
  return NextResponse.json({ ok: true, linkedAt: new Date().toISOString() });
});

/** DELETE /api/jobs/{id}/documents — unlink (FR-05). */
export const DELETE = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId wajib diisi" }, { status: 400 });
  }
  uuidSchema.parse(documentId);
  uuidSchema.parse(id);
  await unlinkDocumentFromJob(user.id, id, documentId);
  return NextResponse.json({ ok: true });
});
