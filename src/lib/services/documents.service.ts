/**
 * Document management (FR-05) + Export/Import (FR-09).
 * - Documents: store metadata and size-limited file bytes in Neon.
 *   Legacy local files remain readable during migration from local development.
 * - Export: CSV / JSON of user jobs (no binaries, owner-scoped).
 * - Import: CSV parser with column mapping, per-row validation, reports
 *   successful & failed rows without aborting the batch.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../data/db";
import { DomainError } from "./jobs.service";
import { cryptoRandomId } from "../data/jobs.repo";
import {
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  PIPELINE_STATUSES,
  type DocumentType,
  type PipelineStatus,
} from "../domain/schema";
import { escapeCsvCell, parseCsv } from "@/lib/csv";
import { createJob } from "./jobs.service";
import { documentUploadSchema, isoDateSchema } from "../domain/validation";

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || path.resolve(process.cwd(), "storage/documents");

function validateStorageKey(storageKey: string): string {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(storageKey)) {
    throw new DomainError("Path file tidak valid", 403);
  }
  return storageKey;
}

function resolveDocumentPath(storagePath: string): string {
  const root = path.resolve(UPLOAD_ROOT);
  const resolved = path.resolve(root, storagePath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new DomainError("Path file tidak valid", 403);
  }
  return resolved;
}

export async function uploadDocument(
  userId: string,
  input: {
    name: string;
    fileType: string;
    buffer: Buffer;
    category?: string | null;
    versionLabel?: string | null;
    linkToJobId?: string | null;
  },
) {
  const metadata = documentUploadSchema.parse({
    name: input.name,
    category: input.category ?? null,
    versionLabel: input.versionLabel ?? null,
    linkToJobId: input.linkToJobId ?? null,
  });
  const normType = input.fileType.toLowerCase().replace(/^\./, "");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(normType)) {
    throw new DomainError(
      `Tipe file tidak diizinkan. Gunakan salah satu dari: ${DOCUMENT_TYPES.join(", ")}`,
      400,
    );
  }
  if (input.buffer.length > MAX_DOCUMENT_BYTES) {
    throw new DomainError(
      `Ukuran file melebihi batas (${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB)`,
      400,
    );
  }
  if (input.buffer.length === 0) throw new DomainError("File dokumen kosong", 400);

  const docId = cryptoRandomId();
  const safeFilename = `${userId}_${docId}.${normType}`;
  const storageKey = validateStorageKey(safeFilename);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO documents (id, user_id, name, file_type, storage_path, size_bytes, category, version_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        docId,
        userId,
        metadata.name,
        normType,
        storageKey,
        input.buffer.length,
        metadata.category,
        metadata.versionLabel,
      ],
    );

    // Documents are capped at 8 MB; keeping bytes in BYTEA makes metadata and
    // contents atomic without requiring a separate paid object-storage plan.
    await tx.query(
      "INSERT INTO document_blobs (document_id, content) VALUES ($1, $2)",
      [docId, input.buffer],
    );

    if (input.linkToJobId) {
      const job = await tx.query(
        "SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [input.linkToJobId, userId],
      );
      if (!job.rowCount) throw new DomainError("Lowongan tidak ditemukan", 404);
      await tx.query(
        `INSERT INTO job_documents (job_id, document_id, linked_by) VALUES ($1,$2,$3)
         ON CONFLICT (job_id, document_id) DO NOTHING`,
        [input.linkToJobId, docId, userId],
      );
    }
  });

  return {
    id: docId,
    name: metadata.name,
    fileType: normType as DocumentType,
    sizeBytes: input.buffer.length,
    category: metadata.category,
    versionLabel: metadata.versionLabel,
  };
}

export async function listDocuments(userId: string, jobId?: string) {
  const db = getDb();
  if (jobId) {
    const res = await db.query<Record<string, unknown>>(
      `SELECT d.id, d.name, d.file_type, d.size_bytes, d.category, d.version_label, d.created_at, jd.linked_at
       FROM documents d
       JOIN job_documents jd ON jd.document_id = d.id
       WHERE jd.job_id = $1 AND d.user_id = $2 AND d.deleted_at IS NULL
       ORDER BY jd.linked_at DESC`,
      [jobId, userId],
    );
    return res.rows.map(mapDocumentListItem);
  }

  const res = await db.query<Record<string, unknown>>(
    `SELECT d.id, d.name, d.file_type, d.size_bytes, d.category, d.version_label, d.created_at,
            (SELECT COUNT(*) FROM job_documents jd WHERE jd.document_id = d.id) AS linked_count
     FROM documents d
     WHERE d.user_id = $1 AND d.deleted_at IS NULL
     ORDER BY d.created_at DESC`,
    [userId],
  );
  return res.rows.map(mapDocumentListItem);
}

function mapDocumentListItem(row: Record<string, unknown>) {
  const toIsoTimestamp = (value: unknown) =>
    value instanceof Date ? value.toISOString() : String(value ?? "");

  return {
    id: String(row.id),
    name: String(row.name),
    file_type: String(row.file_type),
    size_bytes: Number(row.size_bytes),
    category: (row.category as string | null) ?? null,
    version_label: (row.version_label as string | null) ?? null,
    created_at: toIsoTimestamp(row.created_at),
    ...(row.linked_count !== undefined
      ? { linked_count: Number(row.linked_count) }
      : {}),
    ...(row.linked_at !== undefined
      ? { linked_at: toIsoTimestamp(row.linked_at) }
      : {}),
  };
}

export async function getDocumentStream(userId: string, documentId: string) {
  const db = getDb();
  const res = await db.query<{
    name: string;
    file_type: string;
    storage_path: string;
    content: Uint8Array | null;
  }>(
    `SELECT d.name, d.file_type, d.storage_path, b.content
     FROM documents d
     LEFT JOIN document_blobs b ON b.document_id = d.id
     WHERE d.id = $1 AND d.user_id = $2 AND d.deleted_at IS NULL`,
    [documentId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Dokumen tidak ditemukan", 404);

  const doc = res.rows[0];
  const storageKey = validateStorageKey(doc.storage_path);
  let buffer: Buffer;
  if (doc.content) {
    buffer = Buffer.from(doc.content);
  } else {
    // Backward compatibility for documents uploaded before file bytes were
    // stored in Neon. New uploads never write to this local-only path.
    const diskPath = resolveDocumentPath(storageKey);
    if (!fs.existsSync(diskPath)) {
      throw new DomainError("Isi dokumen tidak ditemukan di Neon", 404);
    }
    buffer = await fs.promises.readFile(diskPath);
  }
  return {
    buffer,
    name: doc.name,
    fileType: doc.file_type,
  };
}

export async function linkDocumentToJob(
  userId: string,
  jobId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const doc = await tx.query(
      `SELECT id FROM documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [documentId, userId],
    );
    if (doc.rowCount === 0) throw new DomainError("Dokumen tidak ditemukan", 404);

    const job = await tx.query(
      `SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [jobId, userId],
    );
    if (job.rowCount === 0) throw new DomainError("Lowongan tidak ditemukan", 404);

    const isPg = tx.isPostgres();
    await tx.query(
      isPg
        ? `INSERT INTO job_documents (job_id, document_id, linked_by) VALUES ($1,$2,$3)
           ON CONFLICT (job_id, document_id) DO NOTHING`
        : `INSERT OR IGNORE INTO job_documents (job_id, document_id, linked_by) VALUES ($1,$2,$3)`,
      [jobId, documentId, userId],
    );
  });
}

export async function updateDocumentMetadata(
  userId: string,
  documentId: string,
  patch: { name?: string; category?: string | null; versionLabel?: string | null },
): Promise<void> {
  const db = getDb();
  const fields = {
    name: "name",
    category: "category",
    versionLabel: "version_label",
  } as const;
  const params: unknown[] = [documentId, userId];
  const sets: string[] = [];
  for (const [key, column] of Object.entries(fields)) {
    if (!(key in patch)) continue;
    params.push(patch[key as keyof typeof patch] ?? null);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return;
  const result = await db.query(
    `UPDATE documents SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params,
  );
  if (!result.rowCount) throw new DomainError("Dokumen tidak ditemukan", 404);
}

export async function unlinkDocumentFromJob(
  userId: string,
  jobId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  await db.query(
    `DELETE FROM job_documents WHERE job_id = $1 AND document_id = $2
     AND EXISTS (SELECT 1 FROM documents d WHERE d.id = $2 AND d.user_id = $3)`,
    [jobId, documentId, userId],
  );
}

export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  const db = getDb();
  const found = await db.query<{ storage_path: string }>(
    "SELECT storage_path FROM documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [documentId, userId],
  );
  if (!found.rowCount) throw new DomainError("Dokumen tidak ditemukan", 404);
  const storageKey = validateStorageKey(found.rows[0].storage_path);
  const deletedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    const changed = await tx.query(
      "UPDATE documents SET deleted_at = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
      [deletedAt, documentId, userId],
    );
    if (!changed.rowCount) throw new DomainError("Dokumen tidak ditemukan", 404);
    await tx.query("DELETE FROM document_blobs WHERE document_id = $1", [documentId]);
  });

  // Remove an old local copy when one exists; a missing file is expected for
  // Neon-backed uploads and must not fail the soft-delete operation.
  await fs.promises.rm(resolveDocumentPath(storageKey), { force: true }).catch(() => undefined);
}

/* --------------------------------- export -------------------------------- */

export async function exportJobs(userId: string, format: "csv" | "json") {
  const db = getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT company, position, source, applied_at, deadline, status, notes,
            salary_range, job_url, location, priority
     FROM jobs WHERE user_id = $1 AND deleted_at IS NULL ORDER BY applied_at DESC`,
    [userId],
  );

  if (format === "json") {
    return {
      contentType: "application/json",
      filename: `jobspace_export_${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(res.rows, null, 2),
    };
  }

  // CSV
  const headers = [
    "company",
    "position",
    "source",
    "applied_at",
    "deadline",
    "status",
    "notes",
    "salary_range",
    "job_url",
    "location",
    "priority",
  ];
  const lines = [headers.join(",")];
  for (const row of res.rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  }

  return {
    contentType: "text/csv; charset=utf-8",
    filename: `jobspace_export_${new Date().toISOString().slice(0, 10)}.csv`,
    content: lines.join("\r\n"),
  };
}

/* --------------------------------- import -------------------------------- */

export type ImportSummary = {
  totalRows: number;
  successRows: number;
  failedRows: number;
  failedDetails: { row: number; error: string; data?: Record<string, string> }[];
};

export async function importJobsFromCsv(
  userId: string,
  csvText: string,
  columnMapping?: Record<string, string>,
): Promise<ImportSummary> {
  if (Buffer.byteLength(csvText, "utf8") > MAX_IMPORT_BYTES) {
    throw new DomainError("CSV melebihi batas ukuran 5 MB", 413);
  }
  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    throw new DomainError(err instanceof Error ? err.message : "CSV tidak valid", 400);
  }
  if (rows.length === 0) {
    throw new DomainError("File CSV kosong atau tidak memiliki baris data", 400);
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new DomainError(`CSV maksimal berisi ${MAX_IMPORT_ROWS} baris data`, 413);
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  // Canonical columns: company, position, applied_at, status, source, deadline, notes, salary_range, job_url
  const mapping: Record<string, number> = {};
  header.forEach((name, idx) => {
    const target = columnMapping?.[name] || name;
    mapping[target] = idx;
  });

  const getCol = (aliasList: string[]): number | undefined => {
    for (const a of aliasList) {
      if (mapping[a] !== undefined) return mapping[a];
    }
    return undefined;
  };

  const colCompany = getCol(["company", "perusahaan", "nama perusahaan"]);
  const colPosition = getCol(["position", "posisi", "role", "jabatan"]);
  const colAppliedAt = getCol(["applied_at", "appliedat", "tanggal lamar", "tanggal_lamar", "applied date"]);
  const colStatus = getCol(["status", "tahap", "pipeline"]);
  const colSource = getCol(["source", "sumber"]);
  const colDeadline = getCol(["deadline", "tenggat", "jatuh tempo"]);
  const colNotes = getCol(["notes", "catatan", "keterangan"]);
  const colSalary = getCol(["salary_range", "rentang gaji", "salary", "gaji"]);
  const colJobUrl = getCol(["job_url", "url", "link"]);

  if (colCompany === undefined || colPosition === undefined) {
    throw new DomainError(
      "Kolom wajib 'company' (perusahaan) dan 'position' (posisi) tidak ditemukan dalam CSV",
      400,
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const dataRows = rows.slice(1);
  const db = getDb();
  const importConcurrency = db.isPostgres() ? 5 : 1;
  const failedDetails: ImportSummary["failedDetails"] = [];
  let successCount = 0;

  const processRow = async (
    raw: string[],
    rowNumber: number,
  ): Promise<true | ImportSummary["failedDetails"][number] | null> => {
    if (raw.length === 0 || (raw.length === 1 && raw[0].trim() === "")) {
      return null;
    }

    const company = (raw[colCompany] ?? "").trim();
    const position = (raw[colPosition] ?? "").trim();

    if (!company || !position) {
      return {
        row: rowNumber,
        error: "Nama perusahaan atau posisi kosong",
        data: { company, position },
      };
    }

    let appliedAt = colAppliedAt !== undefined ? (raw[colAppliedAt] ?? "").trim() : "";
    if (!isoDateSchema.safeParse(appliedAt).success) {
      appliedAt = todayIso;
    }

    let status: PipelineStatus = "Draft";
    if (colStatus !== undefined) {
      const s = (raw[colStatus] ?? "").trim();
      if ((PIPELINE_STATUSES as readonly string[]).includes(s)) {
        status = s as PipelineStatus;
      }
    }

    let deadline = colDeadline !== undefined ? (raw[colDeadline] ?? "").trim() : null;
    if (deadline && !isoDateSchema.safeParse(deadline).success) {
      deadline = null;
    }

    try {
      await createJob(userId, {
        company,
        position,
        appliedAt,
        status,
        source: colSource !== undefined ? (raw[colSource] ?? "").trim() || null : null,
        deadline,
        notes: colNotes !== undefined ? (raw[colNotes] ?? "").trim() || null : null,
        salaryRange: colSalary !== undefined ? (raw[colSalary] ?? "").trim() || null : null,
        jobUrl: colJobUrl !== undefined ? (raw[colJobUrl] ?? "").trim() || null : null,
      });
      return true;
    } catch (err) {
      return {
        row: rowNumber,
        error: err instanceof Error ? err.message : "Gagal menyimpan baris",
      };
    }
  };

  for (let start = 0; start < dataRows.length; start += importConcurrency) {
    const batch = dataRows.slice(start, start + importConcurrency);
    const outcomes = await Promise.all(
      batch.map((raw, offset) => processRow(raw, start + offset + 2)),
    );
    for (const outcome of outcomes) {
      if (outcome === true) successCount += 1;
      else if (outcome) failedDetails.push(outcome);
    }
  }

  // Record import log
  await db.query(
    `INSERT INTO import_logs (id, user_id, file_name, total_rows, success_rows, failed_rows, failed_details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      cryptoRandomId(),
      userId,
      "import.csv",
      dataRows.length,
      successCount,
      failedDetails.length,
      JSON.stringify(failedDetails.slice(0, 100)),
    ],
  );

  return {
    totalRows: dataRows.length,
    successRows: successCount,
    failedRows: failedDetails.length,
    failedDetails,
  };
}

export { parseCsv } from "@/lib/csv";
