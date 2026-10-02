/**
 * Repository layer: all SQL for jobs and their satellites (communications,
 * status history, reminders, activities). Every read/write is scoped by
 * userId so object-level authorization cannot be bypassed by a client-supplied
 * id. Uses a shared `DbClient` (Postgres/Neon or SQLite).
 */
import type { DbClient } from "./db";
import type {
  CommunicationRecord,
  JobRecord,
  PipelineStatus,
  ReminderRecord,
  StatusHistoryRecord,
} from "../domain/schema";
import { INBOUND_DIRECTIONS } from "../domain/schema";
import { addDays, today } from "../domain/dates";
import { FOLLOW_UP_THRESHOLD_DAYS } from "../domain/schema";
import { dateValueToISO } from "./date-value";

type Row = Record<string, unknown>;

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

const JOB_COLUMNS = [
  "id",
  "user_id",
  "company_id",
  "company",
  "position",
  "source",
  "applied_at",
  "deadline",
  "status",
  "last_response_at",
  "notes",
  "location",
  "work_type",
  "priority",
  "job_url",
  "salary_range",
  "next_action",
  "next_action_date",
  "match_score",
  "interest_level",
  "tech_stack",
  "deleted_at",
  "created_at",
  "updated_at",
] as const;
const JOB_COLUMNS_SQL = JOB_COLUMNS.join(", ");
const JOB_COLUMNS_FOR_LIST_SQL = JOB_COLUMNS.map((column) => `j.${column}`).join(", ");

export function mapJob(row: Row): JobRecord & { companyId: string | null } {
  let techStack: string[] = [];
  const raw = row.tech_stack;
  if (Array.isArray(raw)) techStack = raw as string[];
  else if (typeof raw === "string" && raw.length > 0) {
    try {
      techStack = JSON.parse(raw) as string[];
    } catch {
      techStack = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id ? String(row.company_id) : null,
    company: String(row.company),
    position: String(row.position),
    source: (row.source as string) ?? null,
    appliedAt: dateValueToISO(row.applied_at),
    deadline: row.deadline ? dateValueToISO(row.deadline) : null,
    status: row.status as PipelineStatus,
    lastResponseAt: row.last_response_at ? toIsoTimestamp(row.last_response_at) : null,
    notes: (row.notes as string) ?? null,
    location: (row.location as string) ?? null,
    workType: (row.work_type as string) ?? null,
    priority: (row.priority as string) ?? null,
    jobUrl: (row.job_url as string) ?? null,
    salaryRange: (row.salary_range as string) ?? null,
    nextAction: (row.next_action as string) ?? null,
    nextActionDate: row.next_action_date
      ? dateValueToISO(row.next_action_date)
      : null,
    matchScore: row.match_score === null || row.match_score === undefined
      ? null
      : Number(row.match_score),
    interestLevel: (row.interest_level as string) ?? null,
    techStack,
    deletedAt: row.deleted_at ? toIsoTimestamp(row.deleted_at) : null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function findJobById(
  db: DbClient,
  userId: string,
  jobId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<(JobRecord & { companyId: string | null }) | null> {
  const sql = `SELECT ${JOB_COLUMNS_SQL} FROM jobs WHERE id = $1 AND user_id = $2${
    opts.includeDeleted ? "" : " AND deleted_at IS NULL"
  }`;
  const res = await db.query<Row>(sql, [jobId, userId]);
  if (res.rowCount === 0) return null;
  return mapJob(res.rows[0]);
}

export type JobListFilters = {
  query?: string;
  status?: PipelineStatus;
  dateFrom?: string;
  dateTo?: string;
  source?: string;
  hasDocument?: boolean;
  /** When true, return soft-deleted jobs only (the Archive view, FR-01). */
  archivedOnly?: boolean;
  page: number;
  pageSize: number;
  sort: "appliedAt" | "updatedAt" | "company" | "status";
  order: "asc" | "desc";
};

const SORT_COLUMNS: Record<JobListFilters["sort"], string> = {
  appliedAt: "applied_at",
  updatedAt: "updated_at",
  company: "company",
  status: "status",
};

export async function listJobs(
  db: DbClient,
  userId: string,
  filters: JobListFilters,
): Promise<{ items: (JobRecord & { companyId: string | null })[]; total: number }> {
  const where: string[] = [
    "j.user_id = $1",
    filters.archivedOnly ? "j.deleted_at IS NOT NULL" : "j.deleted_at IS NULL",
  ];
  const params: unknown[] = [userId];

  if (filters.query) {
    params.push(`%${filters.query.toLowerCase()}%`);
    const idx = params.length;
    where.push(
      `(lower(j.company) LIKE $${idx} OR lower(j.position) LIKE $${idx} OR lower(COALESCE(j.notes,'')) LIKE $${idx})`,
    );
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`j.status = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    where.push(`j.applied_at >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    where.push(`j.applied_at <= $${params.length}`);
  }
  if (filters.source) {
    params.push(filters.source);
    where.push(`j.source = $${params.length}`);
  }
  if (filters.hasDocument === true) {
    where.push(
      `EXISTS (SELECT 1 FROM job_documents jd WHERE jd.job_id = j.id)`,
    );
  } else if (filters.hasDocument === false) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM job_documents jd WHERE jd.job_id = j.id)`,
    );
  }

  const whereSql = where.join(" AND ");
  const orderSql = `${SORT_COLUMNS[filters.sort]} ${filters.order === "asc" ? "ASC" : "DESC"}`;

  const listRes = await db.query<Row & { total_count: number | string }>(
    `SELECT ${JOB_COLUMNS_FOR_LIST_SQL},
            COUNT(*) OVER () AS total_count
     FROM jobs j WHERE ${whereSql} ORDER BY ${orderSql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );
  let total = Number(listRes.rows[0]?.total_count ?? 0);
  if (listRes.rows.length === 0 && filters.page > 1) {
    const countRes = await db.query<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM jobs j WHERE ${whereSql}`,
      params,
    );
    total = Number(countRes.rows[0]?.total ?? 0);
  }

  return { items: listRes.rows.map(mapJob), total };
}

export async function insertJob(
  db: DbClient,
  userId: string,
  input: {
    companyId?: string | null;
    company: string;
    position: string;
    source?: string | null;
    appliedAt: string;
    deadline?: string | null;
    status: PipelineStatus;
    notes?: string | null;
    location?: string | null;
    workType?: string | null;
    priority?: string | null;
    jobUrl?: string | null;
    salaryRange?: string | null;
    nextAction?: string | null;
    nextActionDate?: string | null;
    matchScore?: number | null;
    interestLevel?: string | null;
    techStack?: string[];
  },
): Promise<JobRecord & { companyId: string | null }> {
  const id = cryptoRandomId();
  const techStackJson = JSON.stringify(input.techStack ?? []);
  const isPg = db.isPostgres();

  const createdRes = await db.query<Row>(
    isPg
      ? `INSERT INTO jobs (id, user_id, company_id, company, position, source, applied_at, deadline, status,
          notes, location, work_type, priority, job_url, salary_range, next_action, next_action_date,
          match_score, interest_level, tech_stack)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::text[])
         RETURNING ${JOB_COLUMNS_SQL}`
      : `INSERT INTO jobs (id, user_id, company_id, company, position, source, applied_at, deadline, status,
          notes, location, work_type, priority, job_url, salary_range, next_action, next_action_date,
          match_score, interest_level, tech_stack)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING ${JOB_COLUMNS_SQL}`,
    [
      id,
      userId,
      input.companyId ?? null,
      input.company,
      input.position,
      input.source ?? null,
      input.appliedAt,
      input.deadline ?? null,
      input.status,
      input.notes ?? null,
      input.location ?? null,
      input.workType ?? null,
      input.priority ?? null,
      input.jobUrl ?? null,
      input.salaryRange ?? null,
      input.nextAction ?? null,
      input.nextActionDate ?? null,
      input.matchScore ?? null,
      input.interestLevel ?? null,
      isPg ? input.techStack ?? [] : techStackJson,
    ],
  );

  const created = createdRes.rows[0];
  if (!created) throw new Error("Gagal memuat lowongan yang baru dibuat");
  return mapJob(created);
}

export async function updateJobFields(
  db: DbClient,
  userId: string,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const columnMap: Record<string, string> = {
    company: "company",
    companyId: "company_id",
    position: "position",
    source: "source",
    appliedAt: "applied_at",
    deadline: "deadline",
    status: "status",
    notes: "notes",
    location: "location",
    workType: "work_type",
    priority: "priority",
    jobUrl: "job_url",
    salaryRange: "salary_range",
    nextAction: "next_action",
    nextActionDate: "next_action_date",
    matchScore: "match_score",
    interestLevel: "interest_level",
    lastResponseAt: "last_response_at",
  };

  const sets: string[] = [];
  // NOTE: params must be ordered by placeholder appearance in the final SQL.
  // The SET clause comes before the WHERE clause, so VALUES are pushed first and
  // the (jobId, userId) pair goes last. This matters because the SQLite adapter
  // rewrites "$n" to positional "?" placeholders.
  const params: unknown[] = [];
  const valueParams: unknown[] = [];

  for (const [key, column] of Object.entries(columnMap)) {
    if (!(key in patch)) continue;
    valueParams.push(patch[key] ?? null);
    sets.push(`${column} = $${valueParams.length}`);
  }

  if ("techStack" in patch) {
    const stack = (patch.techStack as string[]) ?? [];
    valueParams.push(db.isPostgres() ? stack : JSON.stringify(stack));
    sets.push(
      db.isPostgres()
        ? `tech_stack = $${valueParams.length}::text[]`
        : `tech_stack = $${valueParams.length}`,
    );
  }

  if (sets.length === 0) return;
  sets.push(db.isPostgres() ? "updated_at = now()" : "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

  const idIndex = valueParams.length + 1;
  const userIndex = valueParams.length + 2;
  params.push(...valueParams, jobId, userId);

  await db.query(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${idIndex} AND user_id = $${userIndex} AND deleted_at IS NULL`,
    params,
  );
}

export async function softDeleteJob(
  db: DbClient,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db.query(
    `UPDATE jobs SET deleted_at = $1, updated_at = $2
     WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL`,
    [now, now, jobId, userId],
  );
  return res.rowCount > 0;
}

export async function restoreJob(
  db: DbClient,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const res = await db.query(
    `UPDATE jobs SET deleted_at = NULL, updated_at = $1 WHERE id = $2 AND user_id = $3`,
    [new Date().toISOString(), jobId, userId],
  );
  return res.rowCount > 0;
}

export async function purgeJob(
  db: DbClient,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM jobs WHERE id = $1 AND user_id = $2`,
    [jobId, userId],
  );
  return res.rowCount > 0;
}

/* ---------------------------- status history ---------------------------- */

export async function insertStatusHistory(
  db: DbClient,
  jobId: string,
  fromStatus: PipelineStatus | null,
  toStatus: PipelineStatus,
  source: "pengguna" | "sistem",
): Promise<void> {
  await db.query(
    `INSERT INTO status_histories (id, job_id, from_status, to_status, source, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [cryptoRandomId(), jobId, fromStatus, toStatus, source, new Date().toISOString()],
  );
}

export async function listStatusHistory(
  db: DbClient,
  jobId: string,
): Promise<StatusHistoryRecord[]> {
  const res = await db.query<Row>(
    `SELECT id, job_id, from_status, to_status, source, changed_at
     FROM status_histories WHERE job_id = $1 ORDER BY changed_at DESC`,
    [jobId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    fromStatus: (r.from_status as PipelineStatus) ?? null,
    toStatus: r.to_status as PipelineStatus,
    source: r.source as "pengguna" | "sistem",
    changedAt: String(r.changed_at),
  }));
}

/* ---------------------------- communications ---------------------------- */

export async function insertCommunication(
  db: DbClient,
  input: {
    jobId: string;
    userId: string;
    communicationDate: string;
    channel: string;
    direction: string;
    summary: string;
    recruiterContact?: string | null;
  },
): Promise<CommunicationRecord> {
  const id = cryptoRandomId();
  await db.query(
    `INSERT INTO communications (id, job_id, user_id, communication_date, channel, direction, summary, recruiter_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.jobId,
      input.userId,
      input.communicationDate,
      input.channel,
      input.direction,
      input.summary,
      input.recruiterContact ?? null,
    ],
  );

  // Inbound directions refresh last_response_at on the job
  if ((INBOUND_DIRECTIONS as readonly string[]).includes(input.direction)) {
    const responseTs = `${input.communicationDate}T00:00:00.000Z`;
    await db.query(
      `UPDATE jobs
       SET last_response_at = CASE
             WHEN last_response_at IS NULL OR last_response_at < $1 THEN $1
             ELSE last_response_at
           END,
           updated_at = $2
       WHERE id = $3 AND user_id = $4`,
      [responseTs, new Date().toISOString(), input.jobId, input.userId],
    );
    await db.query(
      "DELETE FROM reminders WHERE job_id = $1 AND user_id = $2 AND type = 'follow_up' AND completed_at IS NULL",
      [input.jobId, input.userId],
    );
  }

  return {
    id,
    jobId: input.jobId,
    userId: input.userId,
    communicationDate: input.communicationDate,
    channel: input.channel as CommunicationRecord["channel"],
    direction: input.direction as CommunicationRecord["direction"],
    summary: input.summary,
    recruiterContact: input.recruiterContact ?? null,
    createdAt: new Date().toISOString(),
  };
}

export async function listCommunications(
  db: DbClient,
  userId: string,
  jobId: string,
): Promise<CommunicationRecord[]> {
  const res = await db.query<Row>(
    `SELECT id, job_id, user_id, communication_date, channel, direction, summary, recruiter_contact, created_at
     FROM communications WHERE job_id = $1 AND user_id = $2
     ORDER BY communication_date DESC, created_at DESC`,
    [jobId, userId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    userId: String(r.user_id),
    communicationDate: dateValueToISO(r.communication_date),
    channel: r.channel as CommunicationRecord["channel"],
    direction: r.direction as CommunicationRecord["direction"],
    summary: String(r.summary),
    recruiterContact: (r.recruiter_contact as string) ?? null,
    createdAt: String(r.created_at),
  }));
}

/* ------------------------------- reminders ------------------------------- */

export async function upsertFollowUpReminder(
  db: DbClient,
  userId: string,
  jobId: string,
  dueDate: string,
): Promise<void> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM reminders
     WHERE job_id = $1 AND user_id = $2 AND type = 'follow_up' AND completed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [jobId, userId],
  );
  if (existing.rowCount > 0) {
    await db.query(
      "UPDATE reminders SET due_date = $1 WHERE id = $2 AND user_id = $3",
      [dueDate, existing.rows[0].id, userId],
    );
    return;
  }

  await db.query(
    `INSERT INTO reminders (id, job_id, user_id, type, due_date) VALUES ($1,$2,$3,'follow_up',$4)`,
    [cryptoRandomId(), jobId, userId, dueDate],
  );
}

export async function upsertDeadlineReminder(
  db: DbClient,
  userId: string,
  jobId: string,
  dueDate: string,
): Promise<void> {
  await db.query(
    `DELETE FROM reminders WHERE job_id = $1 AND user_id = $2 AND type = 'deadline' AND completed_at IS NULL`,
    [jobId, userId],
  );
  await db.query(
    `INSERT INTO reminders (id, job_id, user_id, type, due_date) VALUES ($1,$2,$3,'deadline',$4)`,
    [cryptoRandomId(), jobId, userId, dueDate],
  );
}

export async function listReminders(
  db: DbClient,
  userId: string,
  opts: { status?: "aktif" | "selesai"; jobId?: string } = {},
): Promise<(ReminderRecord & { company: string; position: string; status: string })[]> {
  const where: string[] = ["r.user_id = $1"];
  const params: unknown[] = [userId];

  if (opts.status === "aktif") where.push("r.completed_at IS NULL");
  if (opts.status === "selesai") where.push("r.completed_at IS NOT NULL");
  if (opts.jobId) {
    params.push(opts.jobId);
    where.push(`r.job_id = $${params.length}`);
  }
  where.push("j.deleted_at IS NULL");

  const res = await db.query<Row>(
    `SELECT r.id, r.job_id, r.user_id, r.type, r.due_date, r.completed_at, r.created_at,
            j.company, j.position, j.status
     FROM reminders r JOIN jobs j ON j.id = r.job_id
     WHERE ${where.join(" AND ")}
     ORDER BY r.completed_at IS NULL DESC, r.due_date ASC`,
    params,
  );

  return res.rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    userId: String(r.user_id),
    type: r.type as ReminderRecord["type"],
    dueDate: dateValueToISO(r.due_date),
    completedAt: r.completed_at ? toIsoTimestamp(r.completed_at) : null,
    createdAt: toIsoTimestamp(r.created_at),
    company: String(r.company),
    position: String(r.position),
    status: String(r.status),
  }));
}

export async function completeReminder(
  db: DbClient,
  userId: string,
  reminderId: string,
): Promise<{ ok: boolean; alreadyCompleted?: boolean; dueDate?: string }> {
  const completed = await db.query<Row>(
    `UPDATE reminders
     SET completed_at = $1
     WHERE id = $2 AND user_id = $3 AND completed_at IS NULL
     RETURNING due_date`,
    [new Date().toISOString(), reminderId, userId],
  );
  if (completed.rowCount > 0) {
    return { ok: true, dueDate: dateValueToISO(completed.rows[0].due_date) };
  }

  // Read only on the exceptional path to distinguish a missing reminder from
  // one completed by this or a concurrent request.
  const existing = await db.query<Row>(
    `SELECT due_date FROM reminders WHERE id = $1 AND user_id = $2`,
    [reminderId, userId],
  );
  if (existing.rowCount === 0) return { ok: false };
  return {
    ok: true,
    alreadyCompleted: true,
    dueDate: dateValueToISO(existing.rows[0].due_date),
  };
}

/* ------------------------------- activities ------------------------------ */

export async function logActivity(
  db: DbClient,
  input: {
    userId: string;
    jobId?: string | null;
    kind: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO activities (id, user_id, job_id, kind, message, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      cryptoRandomId(),
      input.userId,
      input.jobId ?? null,
      input.kind,
      input.message,
      db.isPostgres() ? JSON.stringify(input.metadata ?? {}) : JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function listActivities(
  db: DbClient,
  userId: string,
  jobId: string,
  limit = 50,
): Promise<
  { id: string; kind: string; message: string; createdAt: string; metadata: Record<string, unknown> }[]
> {
  const res = await db.query<Row>(
    `SELECT id, kind, message, metadata, created_at FROM activities
     WHERE user_id = $1 AND job_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [userId, jobId, limit],
  );
  return res.rows.map((r) => {
    let meta: Record<string, unknown> = {};
    if (typeof r.metadata === "string") {
      try {
        meta = JSON.parse(r.metadata) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    } else if (r.metadata && typeof r.metadata === "object") {
      meta = r.metadata as Record<string, unknown>;
    }
    return {
      id: String(r.id),
      kind: String(r.kind),
      message: String(r.message),
      createdAt: String(r.created_at),
      metadata: meta,
    };
  });
}

export function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID();
}

export { FOLLOW_UP_THRESHOLD_DAYS, addDays, today };
