import { describe, it, expect } from "vitest";
import {
  canTransition,
  allowedTransitions,
  FOLLOW_UP_THRESHOLD_DAYS,
} from "@/lib/domain/schema";
import {
  evaluateFollowUp,
  needsFollowUpReminder,
  needsDeadlineReminder,
} from "@/lib/domain/follow-up";
import { computeStats } from "@/lib/domain/stats";
import { diffDays, addDays, today } from "@/lib/domain/dates";
import { parseCsv } from "@/lib/services/documents.service";

describe("FR-01: Status Transition Matrix", () => {
  it("allows legal progression from Dilamar to Wawancara", () => {
    expect(canTransition("Dilamar", "Wawancara")).toBe(true);
  });

  it("allows same-status updates (no-op transition)", () => {
    expect(canTransition("Dilamar", "Dilamar")).toBe(true);
  });

  it("allows terminal outcomes (Ditolak / Diterima / Ditutup) from active stages", () => {
    expect(canTransition("Dilamar", "Ditolak")).toBe(true);
    expect(canTransition("Wawancara", "Penawaran")).toBe(true);
    expect(canTransition("Penawaran", "Diterima")).toBe(true);
  });

  it("rejects invalid transitions: Draft cannot jump directly to Wawancara or Diterima", () => {
    expect(canTransition("Draft", "Wawancara")).toBe(false);
    expect(canTransition("Draft", "Diterima")).toBe(false);
  });

  it("rejects skipping stages in the hiring funnel (PRD edge case)", () => {
    // Explicit PRD edge case: Dilamar -> Diterima without an interview step.
    expect(canTransition("Dilamar", "Diterima")).toBe(false);
    expect(canTransition("Dilamar", "Penawaran")).toBe(false);
    expect(canTransition("Perlu Follow-up", "Diterima")).toBe(false);
    expect(canTransition("Wawancara", "Diterima")).toBe(false);
  });

  it("allows recording a rejection or closing from every active stage", () => {
    for (const stage of ["Draft", "Dilamar", "Perlu Follow-up", "Wawancara", "Penawaran"] as const) {
      expect(canTransition(stage, "Ditolak")).toBe(true);
      expect(canTransition(stage, "Ditutup")).toBe(true);
    }
  });

  it("exposes the allowed next statuses cleanly", () => {
    const next = allowedTransitions("Dilamar");
    expect(next).toContain("Wawancara");
    expect(next).toContain("Perlu Follow-up");
  });
});

describe("FR-02: 7-Day Follow-Up Rule", () => {
  const baseNow = new Date("2026-09-28T12:00:00Z");

  it("flags a Dilamar job with appliedAt 8 days ago and no company reply", () => {
    const job = {
      status: "Dilamar" as const,
      appliedAt: "2026-09-20",
      lastResponseAt: null,
      deletedAt: null,
    };
    const res = evaluateFollowUp(job, baseNow);
    expect(res.shouldFlag).toBe(true);
    expect(res.daysSinceApplied).toBe(8);
  });

  it("does NOT flag a job when company already replied (lastResponseAt present)", () => {
    const job = {
      status: "Dilamar" as const,
      appliedAt: "2026-09-10",
      lastResponseAt: "2026-09-15T08:00:00Z",
      deletedAt: null,
    };
    const res = evaluateFollowUp(job, baseNow);
    expect(res.shouldFlag).toBe(false);
    expect(res.hasCompanyReply).toBe(true);
  });

  it("does NOT flag a job applied less than 7 days ago", () => {
    const job = {
      status: "Dilamar" as const,
      appliedAt: "2026-09-25",
      lastResponseAt: null,
      deletedAt: null,
    };
    const res = evaluateFollowUp(job, baseNow);
    expect(res.shouldFlag).toBe(false);
    expect(res.daysSinceApplied).toBe(3);
  });

  it("does NOT flag non-Dilamar jobs (e.g. Draft or Wawancara)", () => {
    const job = {
      status: "Draft" as const,
      appliedAt: "2026-09-01",
      lastResponseAt: null,
      deletedAt: null,
    };
    const res = evaluateFollowUp(job, baseNow);
    expect(res.shouldFlag).toBe(false);
  });

  it("detects overdue follow-up reminder", () => {
    const job = {
      status: "Perlu Follow-up" as const,
      appliedAt: "2026-09-10",
    };
    expect(needsFollowUpReminder(job, baseNow)).toBe(true);
  });
});

describe("FR-08: Statistics Calculation", () => {
  it("computes accurate on-time follow-up rate and interview metrics", () => {
    const jobs = [
      {
        id: "j1",
        userId: "u1",
        company: "Acme",
        position: "Dev",
        source: null,
        appliedAt: "2026-09-01",
        deadline: null,
        status: "Dilamar" as const,
        lastResponseAt: null,
        notes: null,
        location: null,
        workType: null,
        priority: null,
        jobUrl: null,
        salaryRange: null,
        nextAction: null,
        nextActionDate: null,
        matchScore: null,
        interestLevel: null,
        techStack: [],
        deletedAt: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "j2",
        userId: "u1",
        company: "Beta",
        position: "Lead",
        source: null,
        appliedAt: "2026-09-05",
        deadline: null,
        status: "Wawancara" as const,
        lastResponseAt: "2026-09-10T00:00:00Z",
        notes: null,
        location: null,
        workType: null,
        priority: null,
        jobUrl: null,
        salaryRange: null,
        nextAction: null,
        nextActionDate: null,
        matchScore: null,
        interestLevel: null,
        techStack: [],
        deletedAt: null,
        createdAt: "2026-09-05T00:00:00Z",
        updatedAt: "2026-09-05T00:00:00Z",
      },
    ];

    const reminders = [
      {
        id: "r1",
        jobId: "j1",
        userId: "u1",
        type: "follow_up" as const,
        dueDate: "2026-09-08",
        completedAt: "2026-09-07T10:00:00Z", // on-time
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "r2",
        jobId: "j2",
        userId: "u1",
        type: "follow_up" as const,
        dueDate: "2026-09-12",
        completedAt: "2026-09-15T10:00:00Z", // late
        createdAt: "2026-09-05T00:00:00Z",
      },
    ];

    const interviews = [
      {
        id: "i1",
        jobId: "j2",
        userId: "u1",
        scheduledDate: "2026-09-12",
        scheduledTime: "10:00",
        mode: "Online" as const,
        locationOrLink: null,
        interviewer: "Lead",
        result: "Lanjut" as const,
        notes: null,
        prepChecklist: [],
        createdAt: "2026-09-06T00:00:00Z",
      },
    ];

    const stats = computeStats({ jobs, reminders, interviews });
    expect(stats.totalApplications).toBe(2);
    expect(stats.completedFollowUps).toBe(2);
    expect(stats.onTimeFollowUps).toBe(1);
    expect(stats.onTimeFollowUpRate).toBe(50);
    expect(stats.totalInterviews).toBe(1);
    expect(stats.interviewsPassed).toBe(1);
    expect(stats.interviewRate).toBe(50); // 1 of 2 jobs had interview
  });
});

describe("FR-09: CSV Parser with Quoted Values & Multiline", () => {
  it("handles commas inside quoted cells cleanly", () => {
    const csv = `company,position,notes\n"PT Example, Inc.","Full-Stack Developer","Catatan, dengan koma"`;
    const parsed = parseCsv(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[1][0]).toBe("PT Example, Inc.");
    expect(parsed[1][1]).toBe("Full-Stack Developer");
    expect(parsed[1][2]).toBe("Catatan, dengan koma");
  });

  it("handles escaped quotes inside cells", () => {
    const csv = `company,position\n"PT ""Unicorn"" Tech","Frontend"`;
    const parsed = parseCsv(csv);
    expect(parsed[1][0]).toBe('PT "Unicorn" Tech');
  });
});
