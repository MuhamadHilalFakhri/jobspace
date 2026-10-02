import { getDb } from "../data/db";
import { addDays, startOfWeek, today } from "../domain/dates";

export type AnalyticsBucket = {
  weekStart: string;
  applications: number;
  replies: number;
  interviews: number;
  offers: number;
};

export type AnalyticsBreakdown = {
  label: string;
  applications: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
};

export type StageAge = { status: string; count: number; averageDays: number };

export type AnalyticsInsights = {
  weeks: number;
  weeklyTrend: AnalyticsBucket[];
  bySource: AnalyticsBreakdown[];
  byWorkType: AnalyticsBreakdown[];
  stageAging: StageAge[];
};

export async function getAnalyticsInsights(userId: string, weeks = 12): Promise<AnalyticsInsights> {
  const db = getDb();
  const safeWeeks = [4, 12, 26].includes(weeks) ? weeks : 12;
  const currentWeek = startOfWeek();
  const firstWeek = addDays(currentWeek, -7 * (safeWeeks - 1));
  const rangeEnd = addDays(today(), 1);

  const [trend, bySource, byWorkType, stageAging] = await Promise.all([
    db.query<{
      week_start: string | Date;
      applications: number | string;
      replies: number | string;
      interviews: number | string;
      offers: number | string;
    }>(
      `WITH weeks AS (
         SELECT generate_series($2::date, $3::date, interval '1 week')::date AS week_start
       ), applications AS (
         SELECT date_trunc('week', j.applied_at)::date AS week_start, COUNT(*) AS count
         FROM jobs j WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status <> 'Draft'
           AND j.applied_at >= $2::date AND j.applied_at < $4::date
         GROUP BY 1
       ), replies AS (
         SELECT date_trunc('week', c.communication_date)::date AS week_start, COUNT(*) AS count
         FROM communications c WHERE c.user_id = $1 AND c.direction IN ('Masuk','Balasan Perusahaan')
           AND c.communication_date >= $2::date AND c.communication_date < $4::date
         GROUP BY 1
       ), interviews AS (
         SELECT date_trunc('week', i.scheduled_date)::date AS week_start, COUNT(*) AS count
         FROM interviews i WHERE i.user_id = $1 AND i.scheduled_date >= $2::date AND i.scheduled_date < $4::date
         GROUP BY 1
       ), offers AS (
         SELECT date_trunc('week', (h.changed_at AT TIME ZONE 'Asia/Jakarta'))::date AS week_start,
                COUNT(DISTINCT h.job_id) AS count
         FROM status_histories h JOIN jobs j ON j.id = h.job_id
         WHERE j.user_id = $1 AND j.deleted_at IS NULL AND h.to_status IN ('Penawaran','Diterima')
           AND (h.changed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date
           AND (h.changed_at AT TIME ZONE 'Asia/Jakarta')::date < $4::date
         GROUP BY 1
       )
       SELECT weeks.week_start::text AS week_start,
              COALESCE(applications.count, 0) AS applications,
              COALESCE(replies.count, 0) AS replies,
              COALESCE(interviews.count, 0) AS interviews,
              COALESCE(offers.count, 0) AS offers
       FROM weeks
       LEFT JOIN applications USING (week_start)
       LEFT JOIN replies USING (week_start)
       LEFT JOIN interviews USING (week_start)
       LEFT JOIN offers USING (week_start)
       ORDER BY weeks.week_start`,
      [userId, firstWeek, currentWeek, rangeEnd],
    ),
    breakdown(db, userId, "source"),
    breakdown(db, userId, "work_type"),
    db.query<{ status: string; count: number | string; average_days: number | string }>(
      `SELECT j.status, COUNT(*) AS count,
         ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(stage.changed_at, j.updated_at))) / 86400.0))::numeric, 1) AS average_days
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT MAX(h.changed_at) AS changed_at FROM status_histories h
         WHERE h.job_id = j.id AND h.to_status = j.status
       ) stage ON true
       WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status NOT IN ('Draft','Ditolak','Ditutup','Diterima')
       GROUP BY j.status ORDER BY average_days DESC`,
      [userId],
    ),
  ]);

  return {
    weeks: safeWeeks,
    weeklyTrend: trend.rows.map((row) => ({
      weekStart: String(row.week_start).slice(0, 10),
      applications: Number(row.applications),
      replies: Number(row.replies),
      interviews: Number(row.interviews),
      offers: Number(row.offers),
    })),
    bySource: mapBreakdown(bySource.rows),
    byWorkType: mapBreakdown(byWorkType.rows),
    stageAging: stageAging.rows.map((row) => ({
      status: String(row.status),
      count: Number(row.count),
      averageDays: Number(row.average_days),
    })),
  };
}

async function breakdown(db: ReturnType<typeof getDb>, userId: string, column: "source" | "work_type") {
  return db.query<{
    label: string;
    applications: number | string;
    responded: number | string;
    interviewed: number | string;
    offered: number | string;
  }>(
    `SELECT COALESCE(NULLIF(BTRIM(j.${column}), ''), 'Tidak diketahui') AS label,
       COUNT(*) AS applications,
       COUNT(*) FILTER (WHERE j.last_response_at IS NOT NULL) AS responded,
       COUNT(*) FILTER (WHERE j.status IN ('Wawancara','Penawaran','Diterima')) AS interviewed,
       COUNT(*) FILTER (WHERE j.status IN ('Penawaran','Diterima')) AS offered
     FROM jobs j WHERE j.user_id = $1 AND j.deleted_at IS NULL AND j.status <> 'Draft'
     GROUP BY 1 ORDER BY applications DESC, label ASC LIMIT 8`,
    [userId],
  );
}

function mapBreakdown(rows: {
  label: string;
  applications: number | string;
  responded: number | string;
  interviewed: number | string;
  offered: number | string;
}[]): AnalyticsBreakdown[] {
  return rows.map((row) => {
    const applications = Number(row.applications);
    return {
      label: String(row.label),
      applications,
      responseRate: ratio(Number(row.responded), applications),
      interviewRate: ratio(Number(row.interviewed), applications),
      offerRate: ratio(Number(row.offered), applications),
    };
  });
}

function ratio(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}
