/**
 * Pure statistics computation (FR-08). Computes aggregate counts, on-time
 * follow-up rate, and interview totals from caller-provided arrays.
 */
import type {
  InterviewRecord,
  JobRecord,
  PipelineStatus,
  ReminderRecord,
} from "./schema";
import { PIPELINE_STATUSES } from "./schema";
import { isBefore, isSameDay } from "./dates";

export type StatsSummary = {
  totalApplications: number;
  activeApplications: number;
  byStatus: Record<PipelineStatus, number>;
  onTimeFollowUpRate: number; // 0 to 100 percentage
  completedFollowUps: number;
  onTimeFollowUps: number;
  totalInterviews: number;
  interviewsWithResult: number;
  interviewsPassed: number;
  interviewRate: number; // percentage of jobs that reached interview
  offerRate: number; // percentage of applied/processed jobs that reached offer
};

export function computeOutcomeRates(
  jobs: { id: string; status: PipelineStatus; lastResponseAt: string | null }[],
  interviewJobIds: string[],
): { responseRate: number; interviewRate: number; offerRate: number } {
  const appliedJobs = jobs.filter((job) => job.status !== "Draft");
  const denominator = appliedJobs.length;
  const appliedIds = new Set(appliedJobs.map((job) => job.id));
  const interviewedJobs = new Set(interviewJobIds.filter((id) => appliedIds.has(id)));
  const offers = appliedJobs.filter(
    (job) => job.status === "Penawaran" || job.status === "Diterima",
  ).length;
  const responses = appliedJobs.filter((job) => job.lastResponseAt !== null).length;
  const rate = (count: number) =>
    denominator === 0 ? 0 : Math.min(100, Math.round((count / denominator) * 100));

  return {
    responseRate: rate(responses),
    interviewRate: rate(interviewedJobs.size),
    offerRate: rate(offers),
  };
}

export function computeStats(params: {
  jobs: JobRecord[];
  reminders: ReminderRecord[];
  interviews: InterviewRecord[];
}): StatsSummary {
  const { jobs, reminders, interviews } = params;

  const byStatus: Record<PipelineStatus, number> = Object.fromEntries(
    PIPELINE_STATUSES.map((s) => [s, 0]),
  ) as Record<PipelineStatus, number>;

  let activeCount = 0;
  const terminalStatuses: Set<PipelineStatus> = new Set([
    "Diterima",
    "Ditolak",
    "Ditutup",
  ]);

  for (const job of jobs) {
    if (byStatus[job.status] !== undefined) {
      byStatus[job.status] += 1;
    }
    if (!terminalStatuses.has(job.status)) {
      activeCount += 1;
    }
  }

  // Follow-up reminders (only completed ones count toward on-time rate)
  const followUpReminders = reminders.filter((r) => r.type === "follow_up");
  const completedFollowUps = followUpReminders.filter((r) => r.completedAt !== null);

  let onTimeFollowUps = 0;
  for (const r of completedFollowUps) {
    if (!r.completedAt) continue;
    const completedDateOnly = r.completedAt.slice(0, 10);
    // On-time = completed on or before the due date
    if (
      isSameDay(completedDateOnly, r.dueDate) ||
      isBefore(completedDateOnly, r.dueDate)
    ) {
      onTimeFollowUps += 1;
    }
  }

  const onTimeFollowUpRate =
    completedFollowUps.length === 0
      ? 0
      : Math.round((onTimeFollowUps / completedFollowUps.length) * 100);

  // Interviews
  const totalInterviews = interviews.length;
  const interviewsWithResult = interviews.filter((i) => i.result !== "Menunggu").length;
  const interviewsPassed = interviews.filter(
    (i) => i.result === "Lanjut" || i.result === "Diterima",
  ).length;

  const rates = computeOutcomeRates(
    jobs,
    interviews.map((interview) => interview.jobId),
  );

  return {
    totalApplications: jobs.length,
    activeApplications: activeCount,
    byStatus,
    onTimeFollowUpRate,
    completedFollowUps: completedFollowUps.length,
    onTimeFollowUps,
    totalInterviews,
    interviewsWithResult,
    interviewsPassed,
    interviewRate: rates.interviewRate,
    offerRate: rates.offerRate,
  };
}
