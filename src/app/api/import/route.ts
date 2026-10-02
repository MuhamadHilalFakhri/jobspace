import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { importJobsFromCsv } from "@/lib/services/documents.service";
import { readBoundedRequest } from "@/lib/bounded-request";
import { z } from "zod";
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_COLUMNS } from "@/lib/domain/schema";

export const dynamic = "force-dynamic";

const columnMappingSchema = z
  .record(z.string().trim().min(1).max(200), z.enum(IMPORT_FIELDS))
  .refine((mapping) => Object.keys(mapping).length <= MAX_IMPORT_COLUMNS, "Pemetaan CSV maksimal 100 kolom");
const importBodySchema = z.object({
  csv: z.string().max(MAX_IMPORT_BYTES),
  mapping: columnMappingSchema.optional(),
});

/** POST /api/import — multipart CSV upload with column mapping (FR-09). */
export const POST = withUser(async (user, req: NextRequest) => {
  const contentType = req.headers.get("content-type") || "";
  const bounded = await readBoundedRequest(req, MAX_IMPORT_BYTES + 128 * 1024);
  let csvText = "";
  let mapping: Record<string, string> | undefined = undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await bounded.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File CSV wajib diunggah" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Pilih file dengan format .csv" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File CSV kosong" }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "Ukuran CSV maksimal 5 MB" }, { status: 413 });
    }
    csvText = await file.text();
    const mappingRaw = form.get("mapping");
    if (typeof mappingRaw === "string" && mappingRaw.length > 0) {
      try {
        mapping = columnMappingSchema.parse(JSON.parse(mappingRaw));
      } catch {
        return NextResponse.json({ error: "Pemetaan kolom CSV tidak valid" }, { status: 400 });
      }
    }
  } else {
    // Direct raw text or JSON body with { csv, mapping }
    const body = importBodySchema.parse(await bounded.json());
    csvText = body.csv;
    mapping = body.mapping;
  }

  const summary = await importJobsFromCsv(user.id, csvText, mapping);
  return NextResponse.json(summary);
});
