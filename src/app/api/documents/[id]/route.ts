import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  deleteDocument,
  getDocumentStream,
  updateDocumentMetadata,
} from "@/lib/services/documents.service";
import { patchDocumentSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 16 * 1024)).json();
  const patch = patchDocumentSchema.parse(body);
  await updateDocumentMetadata(user.id, id, patch);
  return NextResponse.json({ ok: true });
});

/** GET /api/documents/{id} — download file (FR-05). */
export const GET = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  const { buffer, name, fileType } = await getDocumentStream(user.id, id);

  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeMap[fileType] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
    },
  });
});

/** DELETE /api/documents/{id} (FR-05). */
export const DELETE = withUser(async (user, _req: NextRequest, { params }: Params) => {
  const { id } = await params;
  uuidSchema.parse(id);
  await deleteDocument(user.id, id);
  return NextResponse.json({ ok: true });
});
