import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  deleteDocument,
  getDocumentStream,
  linkDocumentToJob,
  listDocuments,
  unlinkDocumentFromJob,
  uploadDocument,
} from "@/lib/services/documents.service";
import { readBoundedRequest } from "@/lib/bounded-request";
import { documentUploadSchema, uuidSchema } from "@/lib/domain/validation";
import { MAX_DOCUMENT_BYTES } from "@/lib/domain/schema";

export const dynamic = "force-dynamic";

/** GET /api/documents?jobId= (FR-05). */
export const GET = withUser(async (user, req: NextRequest) => {
  const jobId = req.nextUrl.searchParams.get("jobId") || undefined;
  if (jobId && !uuidSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: "ID lamaran tidak valid" }, { status: 400 });
  }
  const items = await listDocuments(user.id, jobId);
  return NextResponse.json({ items });
});

/** POST /api/documents — multipart upload (FR-05). */
export const POST = withUser(async (user, req: NextRequest) => {
  const bounded = await readBoundedRequest(req, MAX_DOCUMENT_BYTES + 128 * 1024);
  const form = await bounded.formData();
  const file = form.get("file");
  const name = form.get("name") || (file instanceof File ? file.name : null);
  const category = form.get("category");
  const versionLabel = form.get("versionLabel") || null;
  const linkToJobId = form.get("linkToJobId") || null;

  if (!(file instanceof File) || !name) {
    return NextResponse.json(
      { error: "File dokumen wajib disertakan" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File dokumen kosong." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Ukuran file melebihi batas 8 MB." }, { status: 413 });
  }

  const metadata = documentUploadSchema.parse({ name, category, versionLabel, linkToJobId });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = file.name.split(".").pop() || "pdf";

  const doc = await uploadDocument(user.id, {
    name: metadata.name,
    fileType: ext,
    buffer,
    category: metadata.category,
    versionLabel: metadata.versionLabel,
    linkToJobId: metadata.linkToJobId,
  });

  return NextResponse.json(doc, { status: 201 });
});
