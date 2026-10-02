import { getDb } from "../data/db";
import { addDays, startOfWeek, today } from "../domain/dates";
import { dateValueToISO } from "../data/date-value";
import type { PipelineStatus } from "../domain/schema";

export type DashboardJobPreview = {
  id: string;
  company: string;
  companyId: string | null;
  position: string;
  status: PipelineStatus;
  appliedAt: string;
  deadline: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  priority: string | null;
};

export async function getDashboardJobPreview(userId: string): Promise<DashboardJobPreview[]> {
  const db = getDb();
  const result = await db.query<{
    id: string;
    company: string;
    company_id: string | null;
    position: string;
    status: PipelineStatus;
    applied_at: string | Date;
    deadline: string | Date | null;
    next_action: string | null;
    next_action_date: string | Date | null;
    priority: string | null;
  }>(
    `WITH ranked AS (
       SELECT j.id, j.company, j.company_id, j.position, j.status, j.applied_at,
              j.deadline, j.next_action, j.next_action_date, j.priority,
              ROW_NUMBER() OVER (PARTITION BY j.status ORDER BY j.updated_at DESC, j.created_at DESC) AS status_rank,
              ROW_NUMBER() OVER (ORDER BY j.applied_at DESC, j.created_at DESC) AS recent_rank
       FROM jobs j WHERE j.user_id = $1 AND j.deleted_at IS NULL
     )
     SELECT id, company, company_id, position, status, applied_at, deadline,
            next_action, next_action_date, priority
     FROM ranked WHERE status_rank <= 4 OR recent_rank <= 5
     ORDER BY applied_at DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    company: String(row.company),
    companyId: row.company_id ? String(row.company_id) : null,
    position: String(row.position),
    status: row.status,
    appliedAt: dateValueToISO(row.applied_at),
    deadline: row.deadline ? dateValueToISO(row.deadline) : null,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date ? dateValueToISO(row.next_action_date) : null,
    priority: row.priority,
  }));
}

export async function getDashboardReminders(userId: string) {
  const db = getDb();
  const res = await db.query<{
    id: string;
    job_id: string;
    type: "follow_up" | "deadline";
    due_date: string | Date;
    completed_at: string | Date | null;
    company: string;
    position: string;
    status: string;
  }>(
    `SELECT r.id, r.job_id, r.type, r.due_date, r.completed_at,
            j.company, j.position, j.status
     FROM reminders r JOIN jobs j ON j.id = r.job_id AND j.user_id = r.user_id
     WHERE r.user_id = $1 AND r.completed_at IS NULL AND r.due_date = $2::date
       AND j.deleted_at IS NULL
     ORDER BY r.due_date, r.created_at
     LIMIT 12`,
    [userId, today()],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    type: row.type,
    dueDate: dateValueToISO(row.due_date),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    company: String(row.company),
    position: String(row.position),
    status: String(row.status),
  }));
}

export async function getDashboardInterviews(userId: string, limit = 8) {
  const db = getDb();
  const res = await db.query<{
    id: string;
    job_id: string;
    scheduled_date: string | Date;
    scheduled_time: string;
    mode: string;
    result: string;
    company: string;
    position: string;
  }>(
    `SELECT i.id, i.job_id, i.scheduled_date, i.scheduled_time, i.mode, i.result,
            j.company, j.position
     FROM interviews i JOIN jobs j ON j.id = i.job_id AND j.user_id = i.user_id
     WHERE i.user_id = $1 AND i.scheduled_date >= $2::date AND i.result = 'Menunggu'
       AND j.deleted_at IS NULL
     ORDER BY i.scheduled_date, i.scheduled_time
     LIMIT $3`,
    [userId, today(), Math.max(1, Math.min(limit, 20))],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    scheduledDate: dateValueToISO(row.scheduled_date),
    scheduledTime: String(row.scheduled_time).slice(0, 5),
    mode: String(row.mode),
    result: String(row.result),
    company: String(row.company),
    position: String(row.position),
  }));
}

export type WorkspacePreferences = {
  weeklyApplicationGoal: number;
  weeklyFollowUpGoal: number;
  quickNotes: string;
  applicationsThisWeek: number;
  followUpsThisWeek: number;
};

export async function getWorkspacePreferences(userId: string): Promise<WorkspacePreferences> {
  const db = getDb();
  const weekStart = startOfWeek();
  const nextWeek = addDays(weekStart, 7);
  await db.query(
    "INSERT INTO workspace_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId],
  );
  const row = await db.query<{
    weekly_application_goal: number | string;
    weekly_follow_up_goal: number | string;
    quick_notes: string;
    applications_this_week: number | string;
    follow_ups_this_week: number | string;
  }>(
    `SELECT s.weekly_application_goal, s.weekly_follow_up_goal, s.quick_notes,
       (SELECT COUNT(*) FROM jobs j
        WHERE j.user_id = s.user_id AND j.deleted_at IS NULL AND j.status <> 'Draft'
          AND j.applied_at >= $2 AND j.applied_at < $3) AS applications_this_week,
       (SELECT COUNT(*) FROM reminders r
        WHERE r.user_id = s.user_id AND r.type = 'follow_up'
          AND r.completed_at >= $4 AND r.completed_at < $5) AS follow_ups_this_week
     FROM workspace_settings s WHERE s.user_id = $1`,
    [userId, weekStart, nextWeek, jakartaMidnightIso(weekStart), jakartaMidnightIso(nextWeek)],
  );
  const settings = row.rows[0];
  return {
    weeklyApplicationGoal: Number(settings?.weekly_application_goal ?? 5),
    weeklyFollowUpGoal: Number(settings?.weekly_follow_up_goal ?? 5),
    quickNotes: settings?.quick_notes ?? "",
    applicationsThisWeek: Number(settings?.applications_this_week ?? 0),
    followUpsThisWeek: Number(settings?.follow_ups_this_week ?? 0),
  };
}

export async function updateWorkspacePreferences(
  userId: string,
  patch: Partial<Pick<WorkspacePreferences, "weeklyApplicationGoal" | "weeklyFollowUpGoal" | "quickNotes">>,
): Promise<WorkspacePreferences> {
  const db = getDb();
  await db.query("INSERT INTO workspace_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const columns: Record<keyof typeof patch, string> = {
    weeklyApplicationGoal: "weekly_application_goal",
    weeklyFollowUpGoal: "weekly_follow_up_goal",
    quickNotes: "quick_notes",
  };
  const params: unknown[] = [userId];
  const sets = Object.entries(columns).flatMap(([key, column]) => {
    const value = patch[key as keyof typeof patch];
    if (value === undefined) return [];
    params.push(value);
    return [`${column} = $${params.length}`];
  });
  if (sets.length) {
    sets.push(db.isPostgres() ? "updated_at = now()" : "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    await db.query(`UPDATE workspace_settings SET ${sets.join(", ")} WHERE user_id = $1`, params);
  }
  return getWorkspacePreferences(userId);
}

export type DashboardAction = {
  id: string;
  kind: "reminder" | "task" | "interview" | "stale";
  recordId: string;
  jobId: string | null;
  title: string;
  detail: string;
  label: string;
  dueDate: string | null;
  href: string;
};

export async function getDashboardActions(userId: string, limit = 18): Promise<DashboardAction[]> {
  const db = getDb();
  const day = today();
  const weekLimit = addDays(day, 7);
  const interviewLimit = addDays(day, 14);
  const res = await db.query<{
    id: string;
    kind: DashboardAction["kind"];
    record_id: string;
    job_id: string | null;
    title: string;
    detail: string;
    label: string;
    due_date: string | Date | null;
    href: string;
    priority_order: number;
  }>(
    `WITH candidates AS (
       SELECT 'reminder'::text AS kind, r.id::text AS record_id, r.id::text AS id,
              r.job_id::text AS job_id, j.position || ' — ' || j.company AS title,
              CASE WHEN r.type = 'deadline' THEN 'Batas akhir lowongan' ELSE 'Tindak lanjut lamaran' END AS detail,
              CASE WHEN r.due_date < $2::date THEN 'Terlambat'
                   WHEN r.type = 'deadline' THEN 'Tenggat dekat' ELSE 'Perlu follow-up' END AS label,
              r.due_date AS due_date,
              '/applications?peek=' || r.job_id::text || CASE WHEN r.type = 'deadline' THEN '&edit=1' ELSE '' END AS href,
              CASE WHEN r.due_date < $2::date THEN 0 ELSE 2 END AS priority_order
       FROM reminders r JOIN jobs j ON j.id = r.job_id AND j.user_id = r.user_id
       WHERE r.user_id = $1 AND r.completed_at IS NULL AND j.deleted_at IS NULL
         AND r.due_date <= $3::date
       UNION ALL
       SELECT 'task', t.id::text, t.id::text, t.job_id::text, t.title,
              COALESCE(c.name, j.company, 'Tugas workspace'),
              CASE WHEN t.due_date < $2::date THEN 'Tugas terlambat' ELSE 'Tugas terbuka' END,
              t.due_date,
              CASE WHEN t.job_id IS NULL THEN '/tasks?edit=' || t.id::text
                   ELSE '/applications?peek=' || t.job_id::text END,
              CASE WHEN t.due_date < $2::date THEN 1 WHEN t.priority = 'Tinggi' THEN 2 ELSE 4 END
       FROM tasks t
       LEFT JOIN jobs j ON j.id = t.job_id AND j.user_id = t.user_id
       LEFT JOIN companies c ON c.id = t.company_id AND c.user_id = t.user_id
       WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.status IN ('Todo','In Progress')
         AND (t.due_date IS NULL OR t.due_date <= $3::date)
       UNION ALL
       SELECT 'interview', i.id::text, i.id::text, i.job_id::text,
              j.position || ' — ' || j.company, COALESCE(i.interviewer, i.mode),
              'Wawancara', i.scheduled_date,
              '/interviews?edit=' || i.id::text, 3
       FROM interviews i JOIN jobs j ON j.id = i.job_id AND j.user_id = i.user_id
       WHERE i.user_id = $1 AND j.deleted_at IS NULL AND i.result = 'Menunggu'
         AND i.scheduled_date BETWEEN $2::date AND $4::date
       UNION ALL
       SELECT 'stale', j.id::text, j.id::text, j.id::text,
              j.position || ' — ' || j.company, 'Belum ada balasan setelah dikirim',
              'Menunggu balasan', j.applied_at + 5,
              '/applications?peek=' || j.id::text, 5
       FROM jobs j
       WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status = 'Dilamar'
         AND j.last_response_at IS NULL AND j.applied_at <= $2::date - 5
         AND NOT EXISTS (
           SELECT 1 FROM communications c WHERE c.job_id = j.id AND c.user_id = j.user_id
             AND c.direction IN ('Masuk','Balasan Perusahaan')
         )
         AND NOT EXISTS (
           SELECT 1 FROM reminders r WHERE r.job_id = j.id AND r.user_id = j.user_id
             AND r.type = 'follow_up' AND r.completed_at IS NULL
         )
     )
     SELECT id, kind, record_id, job_id, title, detail, label, due_date, href, priority_order
     FROM candidates
     ORDER BY due_date ASC NULLS LAST, priority_order ASC, title ASC
     LIMIT $5`,
    [userId, day, weekLimit, interviewLimit, Math.max(1, Math.min(limit, 50))],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    kind: row.kind,
    recordId: String(row.record_id),
    jobId: row.job_id ? String(row.job_id) : null,
    title: String(row.title),
    detail: String(row.detail),
    label: String(row.label),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    href: String(row.href),
  }));
}

export type DataQualityItem = {
  id: string;
  kind: "duplicate" | "missing_action" | "stale";
  jobId: string;
  title: string;
  detail: string;
  href: string;
};

export async function getDataQualityItems(userId: string, limit = 8): Promise<DataQualityItem[]> {
  const db = getDb();
  const res = await db.query<{
    id: string;
    kind: DataQualityItem["kind"];
    job_id: string;
    title: string;
    detail: string;
    href: string;
    created_order: string | Date;
  }>(
    `WITH issues AS (
       SELECT j.id::text AS id, 'duplicate'::text AS kind, j.id::text AS job_id,
              j.position || ' — ' || j.company AS title,
              'Ada lebih dari satu lamaran dengan perusahaan dan posisi yang sama.' AS detail,
              '/applications?peek=' || j.id::text || '&edit=1' AS href, j.created_at AS created_order
       FROM jobs j
       JOIN (
         SELECT lower(btrim(company)) AS company_key, lower(btrim(position)) AS position_key
         FROM jobs WHERE user_id = $1 AND deleted_at IS NULL
         GROUP BY lower(btrim(company)), lower(btrim(position)) HAVING COUNT(*) > 1
       ) dup ON lower(btrim(j.company)) = dup.company_key AND lower(btrim(j.position)) = dup.position_key
       WHERE j.user_id = $1 AND j.deleted_at IS NULL
       UNION ALL
       SELECT j.id::text, 'missing_action', j.id::text, j.position || ' — ' || j.company,
              'Lamaran aktif belum memiliki tindakan atau tanggal follow-up berikutnya.',
              '/applications?peek=' || j.id::text || '&edit=1', j.updated_at
       FROM jobs j
       WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status IN ('Dilamar','Perlu Follow-up')
         AND j.next_action IS NULL AND j.next_action_date IS NULL
       UNION ALL
       SELECT j.id::text, 'stale', j.id::text, j.position || ' — ' || j.company,
              'Status belum diperbarui lebih dari 14 hari.',
              '/applications?peek=' || j.id::text || '&edit=1', j.updated_at
       FROM jobs j
       WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status IN ('Dilamar','Perlu Follow-up','Wawancara')
         AND j.updated_at < now() - interval '14 days'
     )
     SELECT id, kind, job_id, title, detail, href, created_order
     FROM issues ORDER BY created_order ASC LIMIT $2`,
    [userId, Math.max(1, Math.min(limit, 30))],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    kind: row.kind,
    jobId: String(row.job_id),
    title: String(row.title),
    detail: String(row.detail),
    href: String(row.href),
  }));
}

function jakartaMidnightIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`).toISOString();
}
