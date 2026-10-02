/**
 * Pure follow-up rule (FR-02) + reminder generation. No DB access: it takes a
 * snapshot of a job and today's date, and decides what should change.
 */
import { FOLLOW_UP_THRESHOLD_DAYS, type JobRecord } from "./schema";
import { addDays, diffDays, today } from "./dates";

export type FollowUpDecision = {
  /** Job qualifies for the automatic 'Perlu Follow-up' flip. */
  shouldFlag: boolean;
  /** Job currently flagged and the rule can no longer apply. */
  alreadyFlagged: boolean;
  /** Company has replied (inbound communication recorded). */
  hasCompanyReply: boolean;
  /** Application age in whole days. */
  daysSinceApplied: number;
  /** Date the follow-up flag would be/was due. */
  followUpDueDate: string;
  reason: string | null;
};

export function evaluateFollowUp(
  job: Pick<JobRecord, "status" | "appliedAt" | "lastResponseAt" | "deletedAt">,
  now: Date = new Date(),
): FollowUpDecision {
  const todayStr = today(now);
  const dueDate = addDays(job.appliedAt, FOLLOW_UP_THRESHOLD_DAYS);
  const daysSinceApplied = diffDays(job.appliedAt, now);
  const hasCompanyReply = Boolean(job.lastResponseAt);

  const base = {
    daysSinceApplied,
    followUpDueDate: dueDate,
    hasCompanyReply,
    alreadyFlagged: false,
    shouldFlag: false,
    reason: null as string | null,
  };

  if (job.status === "Perlu Follow-up") {
    return { ...base, alreadyFlagged: true, reason: "Sudah ditandai perlu follow-up." };
  }
  if (job.status !== "Dilamar") {
    return { ...base, reason: "Aturan hanya berlaku untuk status Dilamar." };
  }
  if (hasCompanyReply) {
    return {
      ...base,
      reason: "Sudah ada balasan perusahaan; tidak ditandai otomatis.",
    };
  }
  if (daysSinceApplied < FOLLOW_UP_THRESHOLD_DAYS) {
    return {
      ...base,
      reason: `Belum ${FOLLOW_UP_THRESHOLD_DAYS} hari sejak tanggal lamar.`,
    };
  }
  return {
    ...base,
    shouldFlag: true,
    reason: `Tidak ada balasan selama ${daysSinceApplied} hari sejak tanggal lamar.`,
  };
}

export type ReminderPlan = {
  type: "follow_up" | "deadline";
  dueDate: string;
} | null;

/** Reminder needed when the job is flagged and has no open follow-up reminder. */
export function needsFollowUpReminder(
  job: Pick<JobRecord, "status" | "appliedAt">,
  now: Date = new Date(),
): boolean {
  if (job.status !== "Perlu Follow-up") return false;
  const dueDate = addDays(job.appliedAt, FOLLOW_UP_THRESHOLD_DAYS);
  return dueDate <= today(now);
}

/** Deadline reminder exists while a future deadline is present on a live job. */
export function needsDeadlineReminder(
  job: Pick<JobRecord, "deadline" | "deletedAt">,
  now: Date = new Date(),
): boolean {
  if (!job.deadline) return false;
  return job.deadline >= today(now);
}
