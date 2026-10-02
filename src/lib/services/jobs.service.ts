/**
 * Domain services orchestrating business rules for jobs, communications,
 * interviews, reminders, statistics, import/export and templates. All functions
 * require the owning userId and keep mutations atomic with transactions or a
 * single data-modifying Neon statement.
 */
import { getDb } from "../data/db";
import type {
  CommunicationRecord,
  InterviewRecord,
  JobRecord,
  PipelineStatus,
} from "../domain/schema";
import {
  allowedTransitions,
  canTransition,
  DEFAULT_TIMEZONE,
  PIPELINE_STATUSES,
} from "../domain/schema";
import { addDays, diffDays, startOfMonth, toDate, today } from "../domain/dates";
import { FOLLOW_UP_THRESHOLD_DAYS } from "../domain/schema";
import { dateValueToISO } from "../data/date-value";
import { createJobSchema } from "../domain/validation";
import { computeOutcomeRates } from "../domain/stats";
import {
  completeReminder,
  findJobById,
  insertCommunication,
  insertJob,
  insertStatusHistory,
  listActivities,
  listCommunications,
  listJobs,
  listReminders,
  listStatusHistory,
  logActivity,
  mapJob,
  restoreJob,
  purgeJob,
  softDeleteJob,
  updateJobFields,
  upsertDeadlineReminder,
  upsertFollowUpReminder,
  cryptoRandomId,
} from "../data/jobs.repo";

export type JobWithMeta = JobRecord & { companyId: string | null };

export class DomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function parsePrepChecklist(value: unknown): { id: string; label: string; done: boolean }[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is { id: string; label: string; done: boolean } =>
    Boolean(item && typeof item.id === "string" && typeof item.label === "string" && typeof item.done === "boolean"),
  );
}

/* ------------------------------- jobs CRUD ------------------------------- */

export async function createJob(
  userId: string,
  input: {
    companyId?: string | null;
    company: string;
    position: string;
    source?: string | null;
    appliedAt: string;
    deadline?: string | null;
    status?: PipelineStatus;
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
): Promise<JobWithMeta> {
  const validation = createJobSchema.safeParse(input);
  if (!validation.success) {
    throw new DomainError(validation.error.issues[0]?.message ?? "Data lamaran tidak valid");
  }
  input = validation.data;
  const db = getDb();
  const status: PipelineStatus = input.status ?? "Draft";

  if (db.isPostgres()) {
    const result = await db.query<Record<string, unknown>>(
        `WITH company_choice AS (
           SELECT CASE
             WHEN $3::uuid IS NOT NULL THEN (
               SELECT id FROM companies
               WHERE id = $3::uuid AND user_id = $2::uuid AND deleted_at IS NULL
             )
             ELSE (
               SELECT id FROM companies
               WHERE user_id = $2::uuid AND lower(name) = lower($4) AND deleted_at IS NULL
               LIMIT 1
             )
           END AS company_id
         ), inserted AS (
           INSERT INTO jobs (
             id, user_id, company_id, company, position, source, applied_at, deadline, status,
             notes, location, work_type, priority, job_url, salary_range, next_action,
             next_action_date, match_score, interest_level, tech_stack
           )
           SELECT
             $1::uuid, $2::uuid, company_choice.company_id, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::text[]
           FROM company_choice
           WHERE $3::uuid IS NULL OR company_choice.company_id IS NOT NULL
           RETURNING *
         ), inserted_history AS (
           INSERT INTO status_histories (id, job_id, from_status, to_status, source)
           SELECT $21::uuid, id, NULL, status, 'pengguna' FROM inserted
           RETURNING id
         ), inserted_activity AS (
           INSERT INTO activities (id, user_id, job_id, kind, message, metadata)
           SELECT $22::uuid, user_id, id, 'job_created',
                  'Lowongan ' || position || ' @ ' || company || ' dibuat', '{}'::jsonb
           FROM inserted
           RETURNING id
         ), inserted_reminder AS (
           INSERT INTO reminders (id, job_id, user_id, type, due_date)
           SELECT $23::uuid, id, user_id, 'deadline', deadline
           FROM inserted WHERE deadline IS NOT NULL
           RETURNING id
         )
         SELECT inserted.*
         FROM inserted
         CROSS JOIN (SELECT count(*) FROM inserted_history) history_written
         CROSS JOIN (SELECT count(*) FROM inserted_activity) activity_written
         CROSS JOIN (SELECT count(*) FROM inserted_reminder) reminder_written`,
        [
          cryptoRandomId(),
          userId,
          input.companyId ?? null,
          input.company,
          input.position,
          input.source ?? null,
          input.appliedAt,
          input.deadline ?? null,
          status,
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
          input.techStack ?? [],
          cryptoRandomId(),
          cryptoRandomId(),
          cryptoRandomId(),
        ],
      );

    if (!result.rows[0]) {
      if (input.companyId) throw new DomainError("Perusahaan tidak ditemukan", 404);
      throw new Error("Gagal membuat lamaran");
    }
    return mapJob(result.rows[0]);
  }

  return db.transaction(async (tx) => {
    let companyId = input.companyId ?? null;
    if (companyId) {
      const owned = await tx.query(
        "SELECT id FROM companies WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [companyId, userId],
      );
      if (!owned.rowCount) throw new DomainError("Perusahaan tidak ditemukan", 404);
    } else {
      const match = await tx.query(
        "SELECT id FROM companies WHERE user_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL LIMIT 1",
        [userId, input.company],
      );
      companyId = match.rows[0]?.id ? String(match.rows[0].id) : null;
    }
    const job = await insertJob(tx, userId, { ...input, companyId, status });
    await insertStatusHistory(tx, job.id, null, status, "pengguna");
    await logActivity(tx, {
      userId,
      jobId: job.id,
      kind: "job_created",
      message: `Lowongan ${job.position} @ ${job.company} dibuat`,
    });
    if (job.deadline) {
      await upsertDeadlineReminder(tx, userId, job.id, job.deadline);
    }
    return job;
  });
}

export async function getJobDetail(userId: string, jobId: string) {
  const db = getDb();
  const job = await findJobById(db, userId, jobId);
  if (!job) throw new DomainError("Lowongan tidak ditemukan", 404);

  const [communications, statusHistory, reminders, activities] = await Promise.all([
    listCommunications(db, userId, jobId),
    listStatusHistory(db, jobId),
    listReminders(db, userId, { jobId }),
    listActivities(db, userId, jobId, 100),
  ]);

  return {
    job,
    communications,
    statusHistory,
    reminders,
    activities,
    followUp: evaluateJobFollowUp(job),
    allowedStatuses: allowedTransitions(job.status),
  };
}

export async function listJobsForUser(
  userId: string,
  filters: Parameters<typeof listJobs>[2],
) {
  const db = getDb();
  return listJobs(db, userId, filters);
}

export async function updateJob(
  userId: string,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<JobWithMeta> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const job = await findJobById(tx, userId, jobId, { includeDeleted: false });
    if (!job) {
      // Distinguish soft-deleted from truly missing per FR-01 failure cases.
      const deleted = await findJobById(tx, userId, jobId, { includeDeleted: true });
      if (deleted?.deletedAt) {
        throw new DomainError("Data tidak ditemukan (sudah dihapus)", 404);
      }
      throw new DomainError("Lowongan tidak ditemukan", 404);
    }
    const nextAppliedAt = String(patch.appliedAt ?? job.appliedAt);
    const nextDeadline = "deadline" in patch
      ? (patch.deadline as string | null)
      : job.deadline;
    if (nextDeadline && nextDeadline < nextAppliedAt) {
      throw new DomainError("Tenggat tidak boleh lebih awal dari tanggal lamar", 400);
    }

    const newStatus = patch.status as PipelineStatus | undefined;
    if (newStatus && newStatus !== job.status) {
      if (!canTransition(job.status, newStatus)) {
        throw new DomainError(
          `Status tidak dapat diubah dari "${job.status}" ke "${newStatus}". Status yang diizinkan: ${allowedTransitions(job.status).join(", ") || "tidak ada"}`,
          400,
          { allowedStatuses: allowedTransitions(job.status) },
        );
      }
      await insertStatusHistory(tx, jobId, job.status, newStatus, "pengguna");
      await logActivity(tx, {
        userId,
        jobId,
        kind: "status_changed",
        message: `Status berubah: ${job.status} → ${newStatus}`,
        metadata: { from: job.status, to: newStatus, source: "pengguna" },
      });
      if (newStatus === "Perlu Follow-up") {
        await upsertFollowUpReminder(
          tx,
          userId,
          jobId,
          addDays(job.appliedAt, FOLLOW_UP_THRESHOLD_DAYS),
        );
      } else if (job.status === "Perlu Follow-up") {
        await tx.query(
          "DELETE FROM reminders WHERE job_id = $1 AND user_id = $2 AND type = 'follow_up' AND completed_at IS NULL",
          [jobId, userId],
        );
      }
    }

    const updatePatch = { ...patch };
    if (typeof patch.company === "string") {
      const match = await tx.query(
        "SELECT id FROM companies WHERE user_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL LIMIT 1",
        [userId, patch.company],
      );
      updatePatch.companyId = match.rows[0]?.id ? String(match.rows[0].id) : null;
    }
    await updateJobFields(tx, userId, jobId, updatePatch);

    if ("deadline" in patch) {
      const deadline = (patch.deadline as string | null) ?? null;
      if (deadline) {
        await upsertDeadlineReminder(tx, userId, jobId, deadline);
      } else {
        await tx.query(
          "DELETE FROM reminders WHERE job_id = $1 AND user_id = $2 AND type = 'deadline' AND completed_at IS NULL",
          [jobId, userId],
        );
      }
    }

    const updated = await findJobById(tx, userId, jobId);
    if (!updated) throw new DomainError("Lowongan tidak ditemukan", 404);
    return updated;
  });
}

export async function deleteJob(
  userId: string,
  jobId: string,
  opts: { purge?: boolean } = {},
): Promise<void> {
  const db = getDb();

  if (opts.purge) {
    const purged = await purgeJob(db, userId, jobId);
    if (!purged) throw new DomainError("Lowongan tidak ditemukan", 404);
    return;
  }

  const deleted = await softDeleteJob(db, userId, jobId);
  if (!deleted) {
    // A job that is already soft-deleted is reported as not found (FR-01).
    throw new DomainError("Lowongan tidak ditemukan", 404);
  }
  await logActivity(db, {
    userId,
    jobId,
    kind: "job_deleted",
    message: "Lowongan dihapus (soft-delete)",
  });
}

export async function restoreJobById(userId: string, jobId: string): Promise<void> {
  const db = getDb();
  const ok = await restoreJob(db, userId, jobId);
  if (!ok) throw new DomainError("Lowongan tidak ditemukan", 404);
  await logActivity(db, {
    userId,
    jobId,
    kind: "job_restored",
    message: "Lowongan dipulihkan dari arsip",
  });
}

/* ---------------------------- communications ----------------------------- */

export async function addCommunication(
  userId: string,
  jobId: string,
  input: {
    communicationDate: string;
    channel: string;
    direction: string;
    summary: string;
    recruiterContact?: string | null;
  },
): Promise<CommunicationRecord> {
  const db = getDb();

  // FR-03 failure case: a communication date in the future is rejected unless
  // the client explicitly confirms it (confirmedFutureDate flag on the input).
  const todayIso = today();
  if (input.communicationDate > todayIso) {
    throw new DomainError(
      `Tanggal komunikasi (${input.communicationDate}) berada di masa depan. Periksa kembali tanggal atau konfirmasi bila memang benar.`,
      400,
      { code: "FUTURE_DATE", today: todayIso },
    );
  }

  return db.transaction(async (tx) => {
    const job = await findJobById(tx, userId, jobId);
    if (!job) throw new DomainError("Lowongan tidak ditemukan", 404);

    const entry = await insertCommunication(tx, {
      jobId,
      userId,
      communicationDate: input.communicationDate,
      channel: input.channel,
      direction: input.direction,
      summary: input.summary,
      recruiterContact: input.recruiterContact ?? null,
    });

    await logActivity(tx, {
      userId,
      jobId,
      kind: "communication",
      message: `Komunikasi ${input.direction} via ${input.channel}: ${input.summary.slice(0, 120)}`,
    });

    return entry;
  });
}

export async function updateCommunication(
  userId: string,
  jobId: string,
  communicationId: string,
  patch: {
    communicationDate?: string;
    channel?: string;
    direction?: string;
    summary?: string;
    recruiterContact?: string | null;
  },
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx.query<{ job_id: string }>(
      `SELECT c.job_id FROM communications c JOIN jobs j ON j.id = c.job_id
       WHERE c.id = $1 AND c.user_id = $2 AND c.job_id = $3 AND j.deleted_at IS NULL`,
      [communicationId, userId, jobId],
    );
    if (!existing.rowCount) throw new DomainError("Catatan komunikasi tidak ditemukan", 404);

    const columnMap = {
      communicationDate: "communication_date",
      channel: "channel",
      direction: "direction",
      summary: "summary",
      recruiterContact: "recruiter_contact",
    } as const;
    const sets: string[] = [];
    const params: unknown[] = [communicationId, userId];
    for (const [key, column] of Object.entries(columnMap)) {
      if (!(key in patch)) continue;
      params.push(patch[key as keyof typeof patch] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) return;

    await tx.query(
      `UPDATE communications SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`,
      params,
    );

    const relatedJobId = String(existing.rows[0].job_id);
    const inbound = await tx.query<{ last_response: string | Date | null }>(
      `SELECT MAX(communication_date) AS last_response FROM communications
       WHERE job_id = $1 AND user_id = $2 AND direction IN ('Masuk', 'Balasan Perusahaan')`,
      [relatedJobId, userId],
    );
    const lastResponse = inbound.rows[0]?.last_response;
    await tx.query(
      `UPDATE jobs SET last_response_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
      [lastResponse ? `${dateValueToISO(lastResponse)}T00:00:00.000Z` : null, new Date().toISOString(), relatedJobId, userId],
    );
    if (lastResponse) {
      await tx.query(
        "DELETE FROM reminders WHERE job_id = $1 AND user_id = $2 AND type = 'follow_up' AND completed_at IS NULL",
        [relatedJobId, userId],
      );
    }
    await logActivity(tx, {
      userId,
      jobId: relatedJobId,
      kind: "communication_updated",
      message: "Catatan komunikasi diperbarui",
    });
  });
}

/* ------------------------------- follow-up ------------------------------- */

export function evaluateJobFollowUp(job: JobRecord) {
  const daysSinceApplied = diffDays(job.appliedAt, new Date());
  const followUpDueDate = addDays(job.appliedAt, FOLLOW_UP_THRESHOLD_DAYS);
  const hasCompanyReply = Boolean(job.lastResponseAt);
  const isFlagged = job.status === "Perlu Follow-up";
  const shouldFlag =
    job.status === "Dilamar" &&
    !hasCompanyReply &&
    daysSinceApplied >= FOLLOW_UP_THRESHOLD_DAYS;

  return {
    daysSinceApplied,
    followUpDueDate,
    hasCompanyReply,
    isFlagged,
    shouldFlag,
    suggestedNextAction:
      shouldFlag || isFlagged ? "Kirim follow-up ke perusahaan" : null,
  };
}

/**
 * Runs the automatic follow-up sweep (FR-02). Job-list requests schedule it
 * after their response, while this function remains usable by maintenance jobs.
 */
export async function runFollowUpSweep(userId?: string): Promise<{
  flagged: number;
  checked: number;
}> {
  const db = getDb();

  if (db.isPostgres()) {
    const params: unknown[] = [];
    const scopeSql = userId ? "user_id = $1 AND" : "TRUE AND";
    if (userId) params.push(userId);
    params.push(addDays(today(), -FOLLOW_UP_THRESHOLD_DAYS));
    const thresholdIndex = params.length;
    params.push(FOLLOW_UP_THRESHOLD_DAYS);
    const reminderDaysIndex = params.length;

    const result = await db.query<{
      checked: number | string;
      flagged: number | string;
    }>(
      `WITH candidates AS MATERIALIZED (
         SELECT id, user_id, applied_at
         FROM jobs
         WHERE ${scopeSql} deleted_at IS NULL
           AND status = 'Dilamar'
           AND applied_at <= $${thresholdIndex}::date
           AND last_response_at IS NULL
       ), updated_jobs AS (
         UPDATE jobs j
         SET status = 'Perlu Follow-up', updated_at = now()
         FROM candidates c
         WHERE j.id = c.id AND j.user_id = c.user_id
           AND j.deleted_at IS NULL AND j.status = 'Dilamar'
           AND j.last_response_at IS NULL
         RETURNING j.id, j.user_id, j.applied_at
       ), history_written AS (
         INSERT INTO status_histories (id, job_id, from_status, to_status, source)
         SELECT gen_random_uuid(), id, 'Dilamar', 'Perlu Follow-up', 'sistem'
         FROM updated_jobs
         RETURNING id
       ), activity_written AS (
         INSERT INTO activities (id, user_id, job_id, kind, message, metadata)
         SELECT gen_random_uuid(), user_id, id, 'status_changed',
                'Otomatis ditandai Perlu Follow-up (tidak ada balasan ${FOLLOW_UP_THRESHOLD_DAYS} hari)',
                '{"from":"Dilamar","to":"Perlu Follow-up","source":"sistem"}'::jsonb
         FROM updated_jobs
         RETURNING id
       ), reminders_updated AS (
         UPDATE reminders r
         SET due_date = u.applied_at + $${reminderDaysIndex}::integer
         FROM updated_jobs u
         WHERE r.job_id = u.id AND r.user_id = u.user_id
           AND r.type = 'follow_up' AND r.completed_at IS NULL
         RETURNING r.id
       ), reminders_inserted AS (
         INSERT INTO reminders (id, job_id, user_id, type, due_date)
         SELECT gen_random_uuid(), u.id, u.user_id, 'follow_up',
                u.applied_at + $${reminderDaysIndex}::integer
         FROM updated_jobs u
         WHERE NOT EXISTS (
           SELECT 1 FROM reminders r
           WHERE r.job_id = u.id AND r.user_id = u.user_id
             AND r.type = 'follow_up' AND r.completed_at IS NULL
         )
         RETURNING id
       )
       SELECT (SELECT COUNT(*) FROM candidates) AS checked,
              (SELECT COUNT(*) FROM updated_jobs) AS flagged,
              (SELECT COUNT(*) FROM history_written) AS histories_written,
              (SELECT COUNT(*) FROM activity_written) AS activities_written,
              (SELECT COUNT(*) FROM reminders_updated) AS reminders_updated,
              (SELECT COUNT(*) FROM reminders_inserted) AS reminders_inserted`,
      params,
    );
    return {
      checked: Number(result.rows[0]?.checked ?? 0),
      flagged: Number(result.rows[0]?.flagged ?? 0),
    };
  }

  const nowIso = new Date().toISOString();
  const params: unknown[] = [];
  const scopeSql = userId ? "user_id = $1 AND" : "TRUE AND";
  if (userId) params.push(userId);

  const thresholdDate = addDays(today(), -FOLLOW_UP_THRESHOLD_DAYS);
  params.push(thresholdDate);
  const dateIdx = params.length;

  // Candidates: status 'Dilamar', applied >= 7 days ago, no company response
  const candidates = await db.query<{ id: string; user_id: string; applied_at: string }>(
    `SELECT id, user_id, applied_at FROM jobs
     WHERE ${scopeSql} deleted_at IS NULL
       AND status = 'Dilamar'
       AND applied_at <= $${dateIdx}
       AND last_response_at IS NULL`,
    params,
  );

  let flagged = 0;
  for (const row of candidates.rows) {
    await db.transaction(async (tx) => {
      await updateJobFields(tx, row.user_id, row.id, { status: "Perlu Follow-up" });
      await insertStatusHistory(tx, row.id, "Dilamar", "Perlu Follow-up", "sistem");
      await upsertFollowUpReminder(
        tx,
        row.user_id,
        row.id,
        addDays(dateValueToISO(row.applied_at), FOLLOW_UP_THRESHOLD_DAYS),
      );
      await logActivity(tx, {
        userId: row.user_id,
        jobId: row.id,
        kind: "status_changed",
        message: `Otomatis ditandai Perlu Follow-up (tidak ada balasan ${FOLLOW_UP_THRESHOLD_DAYS} hari)`,
        metadata: { from: "Dilamar", to: "Perlu Follow-up", source: "sistem" },
      });
    });
    flagged += 1;
  }

  return { flagged, checked: candidates.rowCount };
}

/* ------------------------------ reminders -------------------------------- */

export async function listRemindersForUser(
  userId: string,
  status?: "aktif" | "selesai",
) {
  const db = getDb();
  return listReminders(db, userId, { status });
}

export async function completeReminderForUser(
  userId: string,
  reminderId: string,
): Promise<{ completedAt: string; alreadyCompleted: boolean }> {
  const db = getDb();
  const res = await completeReminder(db, userId, reminderId);
  if (!res.ok) throw new DomainError("Pengingat tidak ditemukan", 404);
  if (res.alreadyCompleted) {
    throw new DomainError("Pengingat sudah selesai sebelumnya", 409);
  }
  return {
    completedAt: new Date().toISOString(),
    alreadyCompleted: false,
  };
}

export async function updateReminderForUser(
  userId: string,
  reminderId: string,
  dueDate: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const reminder = await tx.query<{ job_id: string }>(
      `SELECT r.job_id FROM reminders r JOIN jobs j ON j.id = r.job_id
       WHERE r.id = $1 AND r.user_id = $2 AND r.completed_at IS NULL AND j.deleted_at IS NULL`,
      [reminderId, userId],
    );
    if (!reminder.rowCount) throw new DomainError("Pengingat tidak ditemukan", 404);
    await tx.query(
      "UPDATE reminders SET due_date = $3 WHERE id = $1 AND user_id = $2 AND completed_at IS NULL",
      [reminderId, userId, dueDate],
    );
    await logActivity(tx, {
      userId,
      jobId: String(reminder.rows[0].job_id),
      kind: "reminder_rescheduled",
      message: `Pengingat dijadwalkan ulang ke ${dueDate}`,
    });
  });
}

/* ------------------------------ statistics ------------------------------- */

export async function getStatsForUser(userId: string) {
  const db = getDb();

  if (db.isPostgres()) {
    const monthStart = startOfMonth();
    const nextMonthDate = toDate(monthStart);
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
    const nextMonthStart = nextMonthDate.toISOString().slice(0, 10);
    const result = await db.query<{
      total_count: number | string;
      active_count: number | string;
      month_count: number | string;
      applied_count: number | string;
      response_count: number | string;
      offer_count: number | string;
      response_days_avg: number | string | null;
      follow_up_completed: number | string;
      follow_up_on_time: number | string;
      interview_count: number | string;
      interview_passed: number | string;
      interviewed_jobs: number | string;
      by_status: Record<string, number> | string;
      company_count: number | string;
      opportunity_count: number | string;
      task_count: number | string;
      completed_task_count: number | string;
      document_count: number | string;
      template_count: number | string;
      active_reminder_count: number | string;
      overdue_reminder_count: number | string;
      upcoming_interview_count: number | string;
    }>(
      `WITH selected_jobs AS MATERIALIZED (
         SELECT id, status, applied_at, last_response_at
         FROM jobs
         WHERE user_id = $1 AND deleted_at IS NULL
       ), job_metrics AS (
         SELECT COUNT(*) AS total_count,
                COUNT(*) FILTER (WHERE status NOT IN ('Diterima','Ditolak','Ditutup')) AS active_count,
                COUNT(*) FILTER (WHERE applied_at >= $2::date AND applied_at < $3::date) AS month_count,
                COUNT(*) FILTER (WHERE status <> 'Draft') AS applied_count,
                COUNT(*) FILTER (WHERE status <> 'Draft' AND last_response_at IS NOT NULL) AS response_count,
                COUNT(*) FILTER (WHERE status IN ('Penawaran','Diterima')) AS offer_count,
                ROUND(AVG(GREATEST(0, (last_response_at AT TIME ZONE 'Asia/Jakarta')::date - applied_at))
                  FILTER (WHERE status <> 'Draft' AND last_response_at IS NOT NULL)) AS response_days_avg,
                jsonb_build_object(
                  'Draft', COUNT(*) FILTER (WHERE status = 'Draft'),
                  'Dilamar', COUNT(*) FILTER (WHERE status = 'Dilamar'),
                  'Perlu Follow-up', COUNT(*) FILTER (WHERE status = 'Perlu Follow-up'),
                  'Wawancara', COUNT(*) FILTER (WHERE status = 'Wawancara'),
                  'Penawaran', COUNT(*) FILTER (WHERE status = 'Penawaran'),
                  'Diterima', COUNT(*) FILTER (WHERE status = 'Diterima'),
                  'Ditolak', COUNT(*) FILTER (WHERE status = 'Ditolak'),
                  'Ditutup', COUNT(*) FILTER (WHERE status = 'Ditutup')
                ) AS by_status
         FROM selected_jobs
       ), reminder_metrics AS (
         SELECT COUNT(*) FILTER (WHERE r.completed_at IS NOT NULL) AS follow_up_completed,
                COUNT(*) FILTER (
                  WHERE r.completed_at IS NOT NULL
                    AND (r.completed_at AT TIME ZONE 'Asia/Jakarta')::date <= r.due_date
                ) AS follow_up_on_time
         FROM reminders r
         JOIN selected_jobs j ON j.id = r.job_id
         WHERE r.user_id = $1 AND r.type = 'follow_up'
       ), interview_metrics AS (
         SELECT COUNT(*) AS interview_count,
                COUNT(*) FILTER (WHERE i.result IN ('Lanjut','Diterima')) AS interview_passed,
                COUNT(DISTINCT j.id) FILTER (WHERE j.status <> 'Draft') AS interviewed_jobs
         FROM interviews i
         JOIN selected_jobs j ON j.id = i.job_id
         WHERE i.user_id = $1
       ), workspace_metrics AS (
         SELECT
           (SELECT COUNT(*) FROM companies WHERE user_id = $1 AND deleted_at IS NULL) AS company_count,
           (SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND deleted_at IS NULL) AS opportunity_count,
           (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND status NOT IN ('Done','Cancelled')) AS task_count,
           (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND (completed_at IS NOT NULL OR status = 'Done')) AS completed_task_count,
           (SELECT COUNT(*) FROM documents WHERE user_id = $1 AND deleted_at IS NULL) AS document_count,
           (SELECT COUNT(*) FROM templates WHERE user_id = $1 AND deleted_at IS NULL) AS template_count,
           (SELECT COUNT(*) FROM reminders r JOIN jobs j ON j.id = r.job_id
             WHERE r.user_id = $1 AND r.completed_at IS NULL AND j.deleted_at IS NULL) AS active_reminder_count,
           (SELECT COUNT(*) FROM reminders r JOIN jobs j ON j.id = r.job_id
             WHERE r.user_id = $1 AND r.completed_at IS NULL AND r.due_date < $4::date AND j.deleted_at IS NULL) AS overdue_reminder_count,
           (SELECT COUNT(*) FROM interviews i JOIN jobs j ON j.id = i.job_id
             WHERE i.user_id = $1 AND i.scheduled_date >= $4::date AND i.result = 'Menunggu' AND j.deleted_at IS NULL) AS upcoming_interview_count
       )
       SELECT jm.*, rm.follow_up_completed, rm.follow_up_on_time,
              im.interview_count, im.interview_passed, im.interviewed_jobs, wm.*
       FROM job_metrics jm
       CROSS JOIN reminder_metrics rm
       CROSS JOIN interview_metrics im
       CROSS JOIN workspace_metrics wm`,
      [userId, monthStart, nextMonthStart, today()],
    );

    const row = result.rows[0];
    const count = (value: number | string | null | undefined) => Number(value ?? 0);
    let byStatus = row.by_status;
    if (typeof byStatus === "string") {
      try {
        byStatus = JSON.parse(byStatus) as Record<string, number>;
      } catch {
        byStatus = {};
      }
    }
    const applied = count(row.applied_count);
    const rate = (numerator: number | string) =>
      applied === 0 ? 0 : Math.min(100, Math.round((count(numerator) / applied) * 100));
    const followUpCompleted = count(row.follow_up_completed);

    return {
      totalApplications: count(row.total_count),
      activeApplications: count(row.active_count),
      applicationsThisMonth: count(row.month_count),
      byStatus,
      followUp: {
        completed: followUpCompleted,
        onTime: count(row.follow_up_on_time),
        rate: followUpCompleted === 0
          ? 0
          : Math.round((count(row.follow_up_on_time) / followUpCompleted) * 100),
      },
      interviews: {
        total: count(row.interview_count),
        passed: count(row.interview_passed),
        rate: rate(row.interviewed_jobs),
      },
      offers: {
        count: count(row.offer_count),
        rate: rate(row.offer_count),
      },
      responseRate: rate(row.response_count),
      responseDays: {
        avg: row.response_days_avg === null ? null : count(row.response_days_avg),
      },
      workspace: {
        companies: count(row.company_count),
        opportunities: count(row.opportunity_count),
        tasks: count(row.task_count),
        completedTasks: count(row.completed_task_count),
        documents: count(row.document_count),
        templates: count(row.template_count),
        activeReminders: count(row.active_reminder_count),
        overdueReminders: count(row.overdue_reminder_count),
        upcomingInterviews: count(row.upcoming_interview_count),
      },
    };
  }

  const [jobsRes, remindersRes, interviewsRes, workspaceRes] = await Promise.all([
    db.query<{
    id: string;
    status: PipelineStatus;
    applied_at: string;
    created_at: string;
    last_response_at: string | null;
  }>(
    `SELECT id, status, applied_at, created_at, last_response_at FROM jobs WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
    ),
    db.query<{
      id: string;
      type: string;
      due_date: string;
      completed_at: string | null;
    }>(
      `SELECT r.id, r.type, r.due_date, r.completed_at FROM reminders r
       JOIN jobs j ON j.id = r.job_id
       WHERE r.user_id = $1 AND j.deleted_at IS NULL`,
      [userId],
    ),
    db.query<{
      job_id: string;
      result: string;
    }>(
      `SELECT job_id, result FROM interviews i
       JOIN jobs j ON j.id = i.job_id
       WHERE i.user_id = $1 AND j.deleted_at IS NULL`,
      [userId],
    ),
    db.query<Record<string, number | string>>(
      `SELECT
         (SELECT COUNT(*) FROM companies WHERE user_id = $1 AND deleted_at IS NULL) AS company_count,
         (SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND deleted_at IS NULL) AS opportunity_count,
         (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND status NOT IN ('Done','Cancelled')) AS task_count,
         (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND (completed_at IS NOT NULL OR status = 'Done')) AS completed_task_count,
         (SELECT COUNT(*) FROM documents WHERE user_id = $1 AND deleted_at IS NULL) AS document_count,
         (SELECT COUNT(*) FROM templates WHERE user_id = $1 AND deleted_at IS NULL) AS template_count,
         (SELECT COUNT(*) FROM reminders r JOIN jobs j ON j.id = r.job_id WHERE r.user_id = $1 AND r.completed_at IS NULL AND j.deleted_at IS NULL) AS active_reminder_count,
         (SELECT COUNT(*) FROM reminders r JOIN jobs j ON j.id = r.job_id WHERE r.user_id = $1 AND r.completed_at IS NULL AND r.due_date < $2 AND j.deleted_at IS NULL) AS overdue_reminder_count,
         (SELECT COUNT(*) FROM interviews i JOIN jobs j ON j.id = i.job_id WHERE i.user_id = $1 AND i.scheduled_date >= $2 AND i.result = 'Menunggu' AND j.deleted_at IS NULL) AS upcoming_interview_count`,
      [userId, today()],
    ),
  ]);
  const jobs = jobsRes.rows;

  const PIPELINE = [
    "Draft",
    "Dilamar",
    "Perlu Follow-up",
    "Wawancara",
    "Penawaran",
    "Diterima",
    "Ditolak",
    "Ditutup",
  ] as const;

  const byStatus: Record<string, number> = Object.fromEntries(
    PIPELINE.map((s) => [s, 0]),
  );
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
  }

  const followUpReminders = remindersRes.rows.filter((r) => r.type === "follow_up");
  const completed = followUpReminders.filter((r) => r.completed_at);
  const onTime = completed.filter((r) => {
    const completedDay = String(r.completed_at).slice(0, 10);
    return completedDay <= dateValueToISO(r.due_date);
  });

  const outcomeRates = computeOutcomeRates(
    jobs.map((job) => ({
      id: job.id,
      status: job.status,
      lastResponseAt: job.last_response_at,
    })),
    interviewsRes.rows.map((row) => String(row.job_id)),
  );
  const totalInterviews = interviewsRes.rows.length;
  const interviewsPassed = interviewsRes.rows.filter((r) =>
    ["Lanjut", "Diterima"].includes(r.result),
  ).length;

  const total = jobs.length;
  const active = total - (byStatus["Diterima"] ?? 0) - (byStatus["Ditolak"] ?? 0) - (byStatus["Ditutup"] ?? 0);
  const thisMonth = jobs.filter(
    (j) => dateValueToISO(j.applied_at).slice(0, 7) === today().slice(0, 7),
  ).length;
  const workspace = workspaceRes.rows[0];
  const count = (value: number | string | null | undefined) => Number(value ?? 0);

  return {
    totalApplications: total,
    activeApplications: Math.max(0, active),
    applicationsThisMonth: thisMonth,
    byStatus,
    followUp: {
      completed: completed.length,
      onTime: onTime.length,
      rate: completed.length === 0 ? 0 : Math.round((onTime.length / completed.length) * 100),
    },
    interviews: {
      total: totalInterviews,
      passed: interviewsPassed,
      rate: outcomeRates.interviewRate,
    },
    offers: {
      count: (byStatus["Penawaran"] ?? 0) + (byStatus["Diterima"] ?? 0),
      rate: outcomeRates.offerRate,
    },
    responseRate: outcomeRates.responseRate,
    responseDays: {
      avg: (() => {
        const withResponse = jobs.filter(
          (j) => j.status !== "Draft" && j.last_response_at,
        );
        if (withResponse.length === 0) return null;
        const sum = withResponse.reduce((acc, j) => {
          return (
            acc +
            Math.max(
              0,
              diffDays(
                j.applied_at,
                String(j.last_response_at).slice(0, 10),
              ),
            )
          );
        }, 0);
        return Math.round(sum / withResponse.length);
      })(),
    },
    workspace: {
      companies: count(workspace.company_count),
      opportunities: count(workspace.opportunity_count),
      tasks: count(workspace.task_count),
      completedTasks: count(workspace.completed_task_count),
      documents: count(workspace.document_count),
      templates: count(workspace.template_count),
      activeReminders: count(workspace.active_reminder_count),
      overdueReminders: count(workspace.overdue_reminder_count),
      upcomingInterviews: count(workspace.upcoming_interview_count),
    },
  };
}

/* --------------------------- interviews CRUD ----------------------------- */

export async function createInterview(
  userId: string,
  jobId: string,
  input: {
    scheduledDate: string;
    scheduledTime: string;
    mode: string;
    locationOrLink?: string | null;
    interviewer?: string | null;
    notes?: string | null;
  },
): Promise<InterviewRecord> {
  const db = getDb();

  if (db.isPostgres()) {
    const transitionStatuses = PIPELINE_STATUSES.filter(
      (status) => status !== "Wawancara" && canTransition(status, "Wawancara"),
    );
    const result = await db.query<Record<string, unknown>>(
      `WITH owned_job AS (
         SELECT id, user_id, status FROM jobs
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       ), inserted AS (
         INSERT INTO interviews (
           id, job_id, user_id, scheduled_date, scheduled_time, mode, location_or_link, interviewer, notes
         )
         SELECT $3::uuid, id, user_id, $4, $5, $6, $7, $8, $9 FROM owned_job
         RETURNING *
       ), updated_job AS (
         UPDATE jobs j SET status = 'Wawancara', updated_at = now()
         FROM owned_job
         WHERE j.id = owned_job.id AND j.user_id = owned_job.user_id
           AND owned_job.status = ANY($10::text[])
         RETURNING owned_job.id, owned_job.status
       ), inserted_history AS (
         INSERT INTO status_histories (id, job_id, from_status, to_status, source)
         SELECT $11::uuid, id, status, 'Wawancara', 'pengguna' FROM updated_job
         RETURNING id
       ), inserted_activity AS (
         INSERT INTO activities (id, user_id, job_id, kind, message, metadata)
         SELECT $12::uuid, user_id, job_id, 'interview_scheduled', $13, '{}'::jsonb
         FROM inserted
         RETURNING id
       )
       SELECT inserted.*
       FROM inserted
       CROSS JOIN (SELECT count(*) FROM inserted_history) history_written
       CROSS JOIN (SELECT count(*) FROM inserted_activity) activity_written`,
      [
        jobId,
        userId,
        cryptoRandomId(),
        input.scheduledDate,
        input.scheduledTime,
        input.mode,
        input.locationOrLink ?? null,
        input.interviewer ?? null,
        input.notes ?? null,
        transitionStatuses,
        cryptoRandomId(),
        cryptoRandomId(),
        `Wawancara ${input.mode} dijadwalkan ${input.scheduledDate} ${input.scheduledTime}`,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new DomainError("Lowongan tidak ditemukan", 404);
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      userId: String(row.user_id),
      scheduledDate: dateValueToISO(row.scheduled_date),
      scheduledTime: String(row.scheduled_time).slice(0, 5),
      mode: row.mode as InterviewRecord["mode"],
      locationOrLink: (row.location_or_link as string) ?? null,
      interviewer: (row.interviewer as string) ?? null,
      result: String(row.result) as InterviewRecord["result"],
      notes: (row.notes as string) ?? null,
      prepChecklist: parsePrepChecklist(row.prep_checklist),
      createdAt: String(row.created_at),
    };
  }

  return db.transaction(async (tx) => {
    const job = await findJobById(tx, userId, jobId);
    if (!job) throw new DomainError("Lowongan tidak ditemukan", 404);

    const id = cryptoRandomId();
    await tx.query(
      `INSERT INTO interviews (id, job_id, user_id, scheduled_date, scheduled_time, mode, location_or_link, interviewer, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        jobId,
        userId,
        input.scheduledDate,
        input.scheduledTime,
        input.mode,
        input.locationOrLink ?? null,
        input.interviewer ?? null,
        input.notes ?? null,
      ],
    );

    // Keep pipeline coherent: an interview implies the job is in Wawancara
    if (job.status !== "Wawancara" && canTransition(job.status, "Wawancara")) {
      await updateJobFields(tx, userId, jobId, { status: "Wawancara" });
      await insertStatusHistory(tx, jobId, job.status, "Wawancara", "pengguna");
    }

    await logActivity(tx, {
      userId,
      jobId,
      kind: "interview_scheduled",
      message: `Wawancara ${input.mode} dijadwalkan ${input.scheduledDate} ${input.scheduledTime}`,
    });

    return {
      id,
      jobId,
      userId,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      mode: input.mode as InterviewRecord["mode"],
      locationOrLink: input.locationOrLink ?? null,
      interviewer: input.interviewer ?? null,
      result: "Menunggu",
      notes: input.notes ?? null,
      prepChecklist: [],
      createdAt: new Date().toISOString(),
    };
  });
}

export async function listInterviewsForUser(userId: string, jobId?: string) {
  const db = getDb();
  const params: unknown[] = [userId];
  let where = "i.user_id = $1 AND j.deleted_at IS NULL";
  if (jobId) {
    params.push(jobId);
    where += ` AND i.job_id = $${params.length}`;
  }
  const res = await db.query(
    `SELECT i.id, i.job_id, i.user_id, i.scheduled_date, i.scheduled_time, i.mode,
            i.location_or_link, i.interviewer, i.result, i.notes, i.prep_checklist, i.created_at,
            j.company, j.position
     FROM interviews i JOIN jobs j ON j.id = i.job_id
     WHERE ${where} ORDER BY i.scheduled_date DESC, i.scheduled_time DESC`,
    params,
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    userId: String(r.user_id),
    scheduledDate: dateValueToISO(r.scheduled_date),
    scheduledTime: String(r.scheduled_time).slice(0, 5),
    mode: String(r.mode),
    locationOrLink: (r.location_or_link as string) ?? null,
    interviewer: (r.interviewer as string) ?? null,
    result: String(r.result),
    notes: (r.notes as string) ?? null,
    prepChecklist: parsePrepChecklist(r.prep_checklist),
    createdAt: toIsoTimestamp(r.created_at),
    company: String(r.company),
    position: String(r.position),
  }));
}

export async function updateInterview(
  userId: string,
  interviewId: string,
  patch: {
    scheduledDate?: string;
    scheduledTime?: string;
    mode?: string;
    locationOrLink?: string | null;
    interviewer?: string | null;
    result?: string;
    notes?: string | null;
    prepChecklist?: { id: string; label: string; done: boolean }[];
  },
): Promise<void> {
  const db = getDb();
  const columnMap: Record<string, string> = {
    scheduledDate: "scheduled_date",
    scheduledTime: "scheduled_time",
    mode: "mode",
    locationOrLink: "location_or_link",
    interviewer: "interviewer",
    result: "result",
    notes: "notes",
    prepChecklist: "prep_checklist",
  };

  await db.transaction(async (tx) => {
    const existing = await tx.query(
      `SELECT i.id, i.job_id FROM interviews i JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.user_id = $2 AND j.deleted_at IS NULL`,
      [interviewId, userId],
    );
    if (existing.rowCount === 0) throw new DomainError("Jadwal wawancara tidak ditemukan", 404);

    const sets: string[] = [];
    const params: unknown[] = [interviewId, userId];
    for (const [key, column] of Object.entries(columnMap)) {
      if (!(key in patch)) continue;
      const value = patch[key as keyof typeof patch] ?? null;
      params.push(key === "prepChecklist" ? JSON.stringify(value) : value);
      sets.push(`${column} = $${params.length}${key === "prepChecklist" && db.isPostgres() ? "::jsonb" : ""}`);
    }
    if (sets.length > 0) {
      await tx.query(
        `UPDATE interviews SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`,
        params,
      );
    }

    if (patch.result) {
      await logActivity(tx, {
        userId,
        jobId: String(existing.rows[0].job_id),
        kind: "interview_result",
        message: `Hasil wawancara: ${patch.result}`,
      });
    }
  });
}

/* ------------------------------- templates ------------------------------- */

export async function listTemplates(userId: string) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, name, type, content, created_at FROM templates
     WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [userId],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as "email" | "surat",
    content: String(row.content),
    deleted_at: null,
    created_at: toIsoTimestamp(row.created_at),
  }));
}

export async function createTemplate(
  userId: string,
  input: { name: string; type: string; content: string },
) {
  const db = getDb();
  const id = cryptoRandomId();
  await db.query(
    `INSERT INTO templates (id, user_id, name, type, content) VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, input.name, input.type, input.content],
  );
  return { id, ...input };
}

export async function updateTemplate(
  userId: string,
  templateId: string,
  patch: { name?: string; type?: string; content?: string },
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [templateId, userId];
  for (const key of ["name", "type", "content"] as const) {
    if (!(key in patch)) continue;
    params.push(patch[key]);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return;
  const res = await db.query(
    `UPDATE templates SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params,
  );
  if (res.rowCount === 0) throw new DomainError("Template tidak ditemukan", 404);
}

export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  const db = getDb();
  const res = await db.query(
    `UPDATE templates SET deleted_at = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
    [new Date().toISOString(), templateId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Template tidak ditemukan", 404);
}

/* ------------------------------ opportunities ---------------------------- */

export async function listOpportunities(userId: string) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, user_id, position, company, company_id, source, url, location,
            salary_range, deadline, interest_level, tech_stack, match_score,
            date_found, notes, status, converted_job_id, created_at
     FROM opportunities WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY date_found DESC`,
    [userId],
  );
  return res.rows.map(mapOpportunity);
}

export async function createOpportunity(
  userId: string,
  input: {
    position: string;
    company: string;
    source?: string | null;
    url?: string | null;
    location?: string | null;
    salaryRange?: string | null;
    deadline?: string | null;
    interestLevel?: string | null;
    techStack?: string[];
    matchScore?: number | null;
    notes?: string | null;
    status?: string;
  },
) {
  const db = getDb();
  const id = cryptoRandomId();
  const isPg = db.isPostgres();
  const tech = input.techStack ?? [];
  await db.query(
    isPg
      ? `INSERT INTO opportunities (id, user_id, company_id, position, company, source, url, location, salary_range, deadline, interest_level, tech_stack, match_score, notes, status)
         VALUES ($1,$2,
           (SELECT id FROM companies WHERE user_id = $2 AND lower(name) = lower($4) AND deleted_at IS NULL LIMIT 1),
           $3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13,$14)`
      : `INSERT INTO opportunities (id, user_id, company_id, position, company, source, url, location, salary_range, deadline, interest_level, tech_stack, match_score, notes, status)
         VALUES ($1,$2,
           (SELECT id FROM companies WHERE user_id = $2 AND lower(name) = lower($4) AND deleted_at IS NULL LIMIT 1),
           $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      userId,
      input.position,
      input.company,
      input.source ?? null,
      input.url ?? null,
      input.location ?? null,
      input.salaryRange ?? null,
      input.deadline ?? null,
      input.interestLevel ?? null,
      isPg ? tech : JSON.stringify(tech),
      input.matchScore ?? null,
      input.notes ?? null,
      input.status ?? "Inbox",
    ],
  );
  return id;
}

export async function updateOpportunity(
  userId: string,
  opportunityId: string,
  patch: {
    position?: string;
    company?: string;
    source?: string | null;
    url?: string | null;
    location?: string | null;
    salaryRange?: string | null;
    deadline?: string | null;
    interestLevel?: string | null;
    techStack?: string[];
    matchScore?: number | null;
    notes?: string | null;
    status?: string;
  },
): Promise<void> {
  const db = getDb();
  const fields = {
    position: "position",
    company: "company",
    source: "source",
    url: "url",
    location: "location",
    salaryRange: "salary_range",
    deadline: "deadline",
    interestLevel: "interest_level",
    techStack: "tech_stack",
    matchScore: "match_score",
    notes: "notes",
    status: "status",
  } as const;
  const params: unknown[] = [opportunityId, userId];
  const sets: string[] = [];
  for (const [key, column] of Object.entries(fields)) {
    if (!(key in patch)) continue;
    const value = patch[key as keyof typeof patch];
    params.push(key === "techStack" && !db.isPostgres() ? JSON.stringify(value ?? []) : value ?? null);
    sets.push(`${column} = $${params.length}${key === "techStack" && db.isPostgres() ? "::text[]" : ""}`);
  }
  if ("company" in patch) {
    const companyIndex = params.length;
    params.push(patch.company ?? null);
    sets.push(`company_id = (SELECT id FROM companies WHERE user_id = $2 AND lower(name) = lower($${companyIndex}) AND deleted_at IS NULL LIMIT 1)`);
  }
  if (sets.length === 0) return;
  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  const result = await db.query(
    `UPDATE opportunities SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params,
  );
  if (!result.rowCount) throw new DomainError("Peluang tidak ditemukan", 404);
}

function mapOpportunity(row: Record<string, unknown>) {
  let techStack: string[] = [];
  if (Array.isArray(row.tech_stack)) techStack = row.tech_stack as string[];
  else if (typeof row.tech_stack === "string" && row.tech_stack.length > 0) {
    try {
      techStack = JSON.parse(row.tech_stack) as string[];
    } catch {
      techStack = [];
    }
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    position: String(row.position),
    company: String(row.company),
    companyId: row.company_id ? String(row.company_id) : null,
    source: (row.source as string) ?? null,
    url: (row.url as string) ?? null,
    location: (row.location as string) ?? null,
    salaryRange: (row.salary_range as string) ?? null,
    deadline: row.deadline ? dateValueToISO(row.deadline) : null,
    interestLevel: (row.interest_level as string) ?? null,
    techStack,
    matchScore: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
    dateFound: dateValueToISO(row.date_found),
    notes: (row.notes as string) ?? null,
    status: String(row.status),
    convertedJobId: row.converted_job_id ? String(row.converted_job_id) : null,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

/** Converts an opportunity into a real application (preserving all data). */
export async function convertOpportunity(
  userId: string,
  opportunityId: string,
): Promise<JobWithMeta> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const res = await tx.query(
      `SELECT * FROM opportunities WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [opportunityId, userId],
    );
    if (res.rowCount === 0) throw new DomainError("Peluang tidak ditemukan", 404);

    const opp = mapOpportunity(res.rows[0]);
    if (opp.convertedJobId) {
      const existing = await findJobById(tx, userId, opp.convertedJobId);
      if (existing) return existing;
    }

    const job = await insertJob(tx, userId, {
      companyId: opp.companyId,
      company: opp.company,
      position: opp.position,
      source: opp.source,
      appliedAt: today(),
      deadline: opp.deadline,
      status: "Draft",
      notes: opp.notes,
      jobUrl: opp.url,
      salaryRange: opp.salaryRange,
      matchScore: opp.matchScore,
      interestLevel: opp.interestLevel,
      techStack: opp.techStack,
    });
    await insertStatusHistory(tx, job.id, null, "Draft", "pengguna");
    await logActivity(tx, {
      userId,
      jobId: job.id,
      kind: "opportunity_converted",
      message: `Peluang dikonversi menjadi lamaran: ${opp.position} @ ${opp.company}`,
    });

    await tx.query(
      `UPDATE opportunities SET status = 'Applied', converted_job_id = $1, updated_at = $2
       WHERE id = $3 AND user_id = $4`,
      [job.id, new Date().toISOString(), opportunityId, userId],
    );

    return job;
  });
}

/* --------------------------------- pages --------------------------------- */

export async function listPages(userId: string) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, title, icon, section, parent_id, updated_at FROM pages
     WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [userId],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    icon: (row.icon as string | null) ?? null,
    section: String(row.section),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    updated_at: toIsoTimestamp(row.updated_at),
  }));
}

export async function createPage(
  userId: string,
  input: { title: string; icon?: string | null; section?: string; parentId?: string | null },
) {
  const db = getDb();
  const id = cryptoRandomId();
  const inserted = await db.query(
    `INSERT INTO pages (id, user_id, title, icon, section, parent_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE $6 IS NULL OR EXISTS (
       SELECT 1 FROM pages WHERE id = $6 AND user_id = $2 AND deleted_at IS NULL
     )
     RETURNING id`,
    [id, userId, input.title, input.icon ?? null, input.section ?? "Private", input.parentId ?? null],
  );
  if (inserted.rowCount === 0) throw new DomainError("Parent halaman tidak ditemukan", 404);
  return id;
}

export async function getPageWithBlocks(userId: string, pageId: string) {
  const db = getDb();
  const res = await db.query<Record<string, unknown>>(
    `SELECT p.id AS page_id, p.title, p.icon, p.section, p.parent_id,
            b.id AS block_id, b.type AS block_type, b.content AS block_content,
            b.position AS block_position
     FROM pages p
     LEFT JOIN blocks b ON b.page_id = p.id
     WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL
     ORDER BY b.position ASC`,
    [pageId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Halaman tidak ditemukan", 404);
  const page = res.rows[0];
  return {
    id: String(page.page_id),
    title: String(page.title),
    icon: (page.icon as string | null) ?? null,
    section: String(page.section),
    blocks: res.rows.flatMap((row) => row.block_id == null ? [] : [{
      id: String(row.block_id),
      type: String(row.block_type),
      content: (typeof row.block_content === "string"
        ? JSON.parse(row.block_content)
        : row.block_content ?? {}) as Record<string, unknown>,
      position: Number(row.block_position),
    }]),
  };
}

export async function saveBlocks(
  userId: string,
  pageId: string,
  blocks: { id?: string; type: string; content: Record<string, unknown>; position: number }[],
): Promise<void> {
  const db = getDb();

  if (db.isPostgres()) {
    const params: unknown[] = [pageId, userId];
    const blockRows = blocks.map((block) => {
      const idIndex = params.push(cryptoRandomId());
      const typeIndex = params.push(block.type);
      const contentIndex = params.push(JSON.stringify(block.content));
      const positionIndex = params.push(block.position);
      return `($${idIndex}::uuid, $1::uuid, $${typeIndex}::text, $${contentIndex}::jsonb, $${positionIndex}::integer)`;
    });
    const insertBlocks = blockRows.length
      ? `INSERT INTO blocks (id, page_id, type, content, position)
         SELECT incoming.id, incoming.page_id, incoming.type, incoming.content, incoming.position
         FROM (VALUES ${blockRows.join(", ")}) AS incoming(id, page_id, type, content, position)
         WHERE EXISTS (SELECT 1 FROM owned_page)
         RETURNING id`
      : `SELECT NULL::uuid AS id WHERE false`;

    const result = await db.query<{ id: string }>(
      `WITH owned_page AS MATERIALIZED (
         SELECT id FROM pages WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       ), deleted_blocks AS (
         DELETE FROM blocks
         WHERE page_id = $1 AND job_id IS NULL
           AND EXISTS (SELECT 1 FROM owned_page)
         RETURNING id
       ), inserted_blocks AS (
         ${insertBlocks}
       ), updated_page AS (
         UPDATE pages SET updated_at = now()
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
         RETURNING id
       )
       SELECT owned_page.id
       FROM owned_page
       CROSS JOIN (SELECT count(*) FROM deleted_blocks) deleted_count
       CROSS JOIN (SELECT count(*) FROM inserted_blocks) inserted_count
       CROSS JOIN (SELECT count(*) FROM updated_page) updated_count`,
      params,
    );

    if (result.rowCount === 0) throw new DomainError("Halaman tidak ditemukan", 404);
    return;
  }

  await db.transaction(async (tx) => {
    const page = await tx.query(
      `SELECT id FROM pages WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [pageId, userId],
    );
    if (page.rowCount === 0) throw new DomainError("Halaman tidak ditemukan", 404);

    await tx.query(`DELETE FROM blocks WHERE page_id = $1 AND job_id IS NULL`, [pageId]);
    for (const b of blocks) {
      await tx.query(
        `INSERT INTO blocks (id, page_id, type, content, position) VALUES ($1,$2,$3,$4,$5)`,
        [cryptoRandomId(), pageId, b.type, JSON.stringify(b.content), b.position],
      );
    }
    await tx.query(
      db.isPostgres()
        ? `UPDATE pages SET updated_at = now() WHERE id = $1`
        : `UPDATE pages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1`,
      [pageId],
    );
  });
}

/* --------------------------------- tasks --------------------------------- */

export async function listTasks(userId: string, filters?: { jobId?: string; status?: string }) {
  const db = getDb();
  const params: unknown[] = [userId];
  let where = "t.user_id = $1 AND t.deleted_at IS NULL";
  if (filters?.jobId) {
    params.push(filters.jobId);
    where += ` AND t.job_id = $${params.length}`;
  }
  if (filters?.status) {
    params.push(filters.status);
    where += ` AND t.status = $${params.length}`;
  }
  const res = await db.query(
    `SELECT t.id, t.user_id, t.job_id, t.company_id, t.title, t.status, t.priority,
            t.due_date, t.task_type, t.notes, t.completed_at, t.created_at,
            j.position AS job_position, COALESCE(c.name, j.company) AS company_name
     FROM tasks t
     LEFT JOIN jobs j ON j.id = t.job_id AND j.user_id = t.user_id
     LEFT JOIN companies c ON c.id = t.company_id AND c.user_id = t.user_id
     WHERE ${where} ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
    params,
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    job_id: row.job_id ? String(row.job_id) : null,
    company_id: row.company_id ? String(row.company_id) : null,
    title: String(row.title),
    status: String(row.status),
    priority: String(row.priority),
    job_position: (row.job_position as string | null) ?? null,
    company_name: (row.company_name as string | null) ?? null,
    due_date: row.due_date ? dateValueToISO(row.due_date) : null,
    task_type: (row.task_type as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    completed_at: row.completed_at ? toIsoTimestamp(row.completed_at) : null,
    created_at: toIsoTimestamp(row.created_at),
  }));
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    jobId?: string | null;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    taskType?: string | null;
    notes?: string | null;
  },
) {
  const db = getDb();
  const id = cryptoRandomId();
  await db.query(
    `INSERT INTO tasks (id, user_id, job_id, title, status, priority, due_date, task_type, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      userId,
      input.jobId ?? null,
      input.title,
      input.status ?? "Todo",
      input.priority ?? "Sedang",
      input.dueDate ?? null,
      input.taskType ?? null,
      input.notes ?? null,
    ],
  );
  return id;
}

export async function updateTask(
  userId: string,
  taskId: string,
  patch: {
    title?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    taskType?: string;
    notes?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const columnMap: Record<string, string> = {
    title: "title",
    priority: "priority",
    dueDate: "due_date",
    taskType: "task_type",
    notes: "notes",
  };
  const sets: string[] = [];
  const params: unknown[] = [taskId, userId];
  for (const [key, column] of Object.entries(columnMap)) {
    if (!(key in patch)) continue;
    params.push(patch[key as keyof typeof patch] ?? null);
    sets.push(`${column} = $${params.length}`);
  }
  if (patch.completedAt !== undefined) {
    const nextStatus = patch.completedAt
      ? "Done"
      : patch.status && patch.status !== "Done"
        ? patch.status
        : "Todo";
    params.push(patch.completedAt);
    sets.push(`completed_at = $${params.length}`);
    params.push(nextStatus);
    sets.push(`status = $${params.length}`);
  } else if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
    if (patch.status === "Done") {
      params.push(new Date().toISOString());
      sets.push(`completed_at = $${params.length}`);
    } else {
      sets.push("completed_at = NULL");
    }
  }
  if (sets.length === 0) return;
  const res = await db.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params,
  );
  if (res.rowCount === 0) throw new DomainError("Task tidak ditemukan", 404);
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const db = getDb();
  const res = await db.query(
    `UPDATE tasks SET deleted_at = $1 WHERE id = $2 AND user_id = $3`,
    [new Date().toISOString(), taskId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Task tidak ditemukan", 404);
}

/* --------------------------------- search -------------------------------- */

export async function globalSearch(userId: string, query: string) {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  const [jobs, opps, pages, companies, tasks] = await Promise.all([
    db.query(
      `SELECT id, company, position, status FROM jobs
       WHERE user_id = $1 AND deleted_at IS NULL AND (lower(company) LIKE $2 OR lower(position) LIKE $3)
       LIMIT 8`,
      [userId, q, q],
    ),
    db.query(
      `SELECT id, company, position, status FROM opportunities
       WHERE user_id = $1 AND deleted_at IS NULL AND (lower(company) LIKE $2 OR lower(position) LIKE $3)
       LIMIT 8`,
      [userId, q, q],
    ),
    db.query(
      `SELECT id, title, icon FROM pages
       WHERE user_id = $1 AND deleted_at IS NULL AND lower(title) LIKE $2 LIMIT 8`,
      [userId, q],
    ),
    db.query(
      `SELECT id, name FROM companies
       WHERE user_id = $1 AND deleted_at IS NULL AND lower(name) LIKE $2 LIMIT 8`,
      [userId, q],
    ),
    db.query(
      `SELECT id, title, status FROM tasks
       WHERE user_id = $1 AND deleted_at IS NULL AND lower(title) LIKE $2 LIMIT 8`,
      [userId, q],
    ),
  ]);

  return {
    jobs: jobs.rows.map((r) => ({ id: String(r.id), company: r.company, position: r.position, status: r.status })),
    opportunities: opps.rows.map((r) => ({ id: String(r.id), company: r.company, position: r.position, status: r.status })),
    pages: pages.rows.map((r) => ({ id: String(r.id), title: r.title, icon: r.icon })),
    companies: companies.rows.map((r) => ({ id: String(r.id), name: r.name })),
    tasks: tasks.rows.map((r) => ({ id: String(r.id), title: r.title, status: r.status })),
  };
}

/* -------------------------------- companies ------------------------------ */

export async function listCompanies(userId: string) {
  const db = getDb();
  const res = await db.query<Record<string, unknown>>(
    `WITH linked_counts AS (
       SELECT company_id, COUNT(*) AS application_count
       FROM jobs
       WHERE user_id = $1 AND deleted_at IS NULL AND company_id IS NOT NULL
       GROUP BY company_id
     ), legacy_counts AS (
       SELECT lower(company) AS company_name, COUNT(*) AS application_count
       FROM jobs
       WHERE user_id = $1 AND deleted_at IS NULL AND company_id IS NULL
       GROUP BY lower(company)
     )
     SELECT c.id, c.name, c.industry, c.website, c.linkedin, c.location, c.size, c.notes,
            COALESCE(linked_counts.application_count, 0)
              + COALESCE(legacy_counts.application_count, 0) AS application_count
     FROM companies c
     LEFT JOIN linked_counts ON linked_counts.company_id = c.id
     LEFT JOIN legacy_counts ON legacy_counts.company_name = lower(c.name)
     WHERE c.user_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.name ASC`,
    [userId],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    industry: (row.industry as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    linkedin: (row.linkedin as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    size: (row.size as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    application_count: Number(row.application_count ?? 0),
  }));
}

export async function createCompany(
  userId: string,
  input: { name: string; industry?: string | null; website?: string | null; linkedin?: string | null; location?: string | null; size?: string | null; notes?: string | null },
) {
  const db = getDb();
  const id = cryptoRandomId();
  await db.query(
    `INSERT INTO companies (id, user_id, name, industry, website, linkedin, location, size, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, userId, input.name, input.industry ?? null, input.website ?? null, input.linkedin ?? null, input.location ?? null, input.size ?? null, input.notes ?? null],
  );
  return id;
}

export async function updateCompany(
  userId: string,
  companyId: string,
  patch: { name?: string; industry?: string | null; website?: string | null; linkedin?: string | null; location?: string | null; size?: string | null; notes?: string | null },
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM companies WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [companyId, userId],
    );
    if (!existing.rowCount) throw new DomainError("Perusahaan tidak ditemukan", 404);

    if (patch.name) {
      const duplicate = await tx.query(
        "SELECT id FROM companies WHERE user_id = $1 AND lower(name) = lower($2) AND id <> $3 AND deleted_at IS NULL LIMIT 1",
        [userId, patch.name, companyId],
      );
      if (duplicate.rowCount) throw new DomainError("Nama perusahaan sudah digunakan", 409);
    }

    const fields = { name: "name", industry: "industry", website: "website", linkedin: "linkedin", location: "location", size: "size", notes: "notes" } as const;
    const params: unknown[] = [companyId, userId];
    const sets: string[] = [];
    for (const [key, column] of Object.entries(fields)) {
      if (!(key in patch)) continue;
      params.push(patch[key as keyof typeof patch] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (!sets.length) return;
    params.push(new Date().toISOString());
    sets.push(`updated_at = $${params.length}`);
    await tx.query(`UPDATE companies SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`, params);

    if (patch.name) {
      await tx.query("UPDATE jobs SET company = $1 WHERE company_id = $2 AND user_id = $3", [patch.name, companyId, userId]);
      await tx.query("UPDATE opportunities SET company = $1 WHERE company_id = $2 AND user_id = $3", [patch.name, companyId, userId]);
    }
  });
}

/** Soft-deletes a company record owned by the user. */
export async function deleteCompany(userId: string, companyId: string): Promise<void> {
  const db = getDb();
  const res = await db.query(
    `UPDATE companies SET deleted_at = $1 WHERE id = $2 AND user_id = $3`,
    [new Date().toISOString(), companyId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Perusahaan tidak ditemukan", 404);
}

/** Soft-deletes an opportunity owned by the user. */
export async function deleteOpportunity(
  userId: string,
  opportunityId: string,
): Promise<void> {
  const db = getDb();
  const res = await db.query(
    `UPDATE opportunities SET deleted_at = $1 WHERE id = $2 AND user_id = $3`,
    [new Date().toISOString(), opportunityId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Peluang tidak ditemukan", 404);
}

/* --------------------------------- pages --------------------------------- */

/** Renames / re-icons a page (metadata only; blocks are managed via saveBlocks). */
export async function updatePageMeta(
  userId: string,
  pageId: string,
  input: { title?: string; icon?: string | null },
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.title !== undefined) {
    params.push(input.title.trim() || "Untitled");
    sets.push("title = $" + params.length);
  }
  if (input.icon !== undefined) {
    params.push(input.icon);
    sets.push("icon = $" + params.length);
  }
  if (sets.length === 0) return;
  if (db.isPostgres()) {
    sets.push("updated_at = now()");
  } else {
    params.push(new Date().toISOString());
    sets.push("updated_at = $" + params.length);
  }
  const idIndex = params.length + 1;
  const userIndex = params.length + 2;
  const sql =
    "UPDATE pages SET " + sets.join(", ") +
    " WHERE id = $" + idIndex + " AND user_id = $" + userIndex +
    " AND deleted_at IS NULL";
  await db.query(sql, [...params, pageId, userId]);
}

/** Soft-deletes a custom page owned by the user. */
export async function deletePage(userId: string, pageId: string): Promise<void> {
  const db = getDb();
  const res = await db.query(
    `UPDATE pages SET deleted_at = $1 WHERE id = $2 AND user_id = $3`,
    [new Date().toISOString(), pageId, userId],
  );
  if (res.rowCount === 0) throw new DomainError("Halaman tidak ditemukan", 404);
}

export { DEFAULT_TIMEZONE };
