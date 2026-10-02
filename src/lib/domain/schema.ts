/**
 * JobSpace domain schema: the single source of truth for statuses, property
 * definitions, relations and enums shared by validation, the data layer and UI.
 * Pure data + tiny helpers, no I/O, so it is safe to import from client code.
 */

export const PIPELINE_STATUSES = [
  "Draft",
  "Dilamar",
  "Perlu Follow-up",
  "Wawancara",
  "Penawaran",
  "Diterima",
  "Ditolak",
  "Ditutup",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PRIORITIES = ["Rendah", "Sedang", "Tinggi"] as const;
export const TASK_STATUSES = ["Todo", "In Progress", "Done", "Cancelled"] as const;

export const OPPORTUNITY_STATUSES = [
  "Inbox",
  "Reviewing",
  "Interested",
  "Preparing",
  "Applied",
  "Skipped",
  "Expired",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const COMMUNICATION_CHANNELS = [
  "Email",
  "Telepon",
  "LinkedIn",
  "WhatsApp",
  "Lainnya",
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_DIRECTIONS = [
  "Keluar",
  "Masuk",
  "Balasan Perusahaan",
] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

/** Directions that count as a company response for the follow-up rule. */
export const INBOUND_DIRECTIONS: readonly CommunicationDirection[] = [
  "Masuk",
  "Balasan Perusahaan",
];

export const STATUS_SOURCES = ["pengguna", "sistem"] as const;
export type StatusSource = (typeof STATUS_SOURCES)[number];

export const DOCUMENT_TYPES = ["pdf", "doc", "docx"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_CATEGORIES = [
  "CV",
  "Cover Letter",
  "Portfolio",
  "Certificate",
  "Transcript",
  "Application Letter",
  "Technical Test",
  "Other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const PAGE_BLOCK_TYPES = [
  "text",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list",
  "numbered_list",
  "todo",
  "quote",
  "divider",
  "code",
  "callout",
] as const;
export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

export const PAGE_ICON_NAMES = [
  "Document", "Folder", "Suitcase", "Book", "Star", "Calendar",
  "CheckCircle", "InfoCircle", "BarChart", "Email", "Code", "Archive",
] as const;

export const TASK_TYPES = [
  "Application", "Research", "CV", "Portfolio", "Assessment", "Technical Test",
  "Interview Preparation", "Follow-up", "Networking", "Documents", "Other",
] as const;

export const MAX_PAGE_BLOCKS = 500;
export const MAX_PAGE_BLOCK_TEXT_CHARS = 10_000;
export const MAX_PAGE_CONTENT_CHARS = 100_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_COLUMNS = 100;
export const MAX_IMPORT_CELL_CHARS = 20_000;
export const IMPORT_FIELDS = [
  "company",
  "position",
  "applied_at",
  "status",
  "source",
  "deadline",
  "notes",
  "salary_range",
  "job_url",
] as const;

export const INTERVIEW_MODES = ["Online", "Onsite", "Telepon"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_RESULTS = [
  "Menunggu",
  "Lanjut",
  "Tidak Lanjut",
  "Diterima",
  "Ditolak",
] as const;
export type InterviewResult = (typeof INTERVIEW_RESULTS)[number];

export const REMINDER_TYPES = ["follow_up", "deadline"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const TEMPLATE_TYPES = ["email", "surat"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/**
 * Allowed pipeline transitions. The funnel is strict: an application must walk
 * the stages in order (Dilamar → Perlu Follow-up → Wawancara → Penawaran →
 * Diterima). Jumping straight from "Dilamar" to "Diterima" is explicitly
 * rejected (PRD FR-01 edge case). Rejections may be recorded from any active
 * stage, and any stage can be closed/archived.
 */
export const STATUS_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  Draft: ["Dilamar", "Ditolak", "Ditutup"],
  Dilamar: ["Perlu Follow-up", "Wawancara", "Ditolak", "Ditutup"],
  "Perlu Follow-up": ["Dilamar", "Wawancara", "Ditolak", "Ditutup"],
  Wawancara: ["Penawaran", "Ditolak", "Ditutup"],
  Penawaran: ["Diterima", "Ditolak", "Ditutup"],
  Diterima: ["Ditutup"],
  Ditolak: ["Ditutup", "Dilamar"],
  Ditutup: ["Dilamar"],
};

const STATUS_TRANSITION_SET: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STATUS_TRANSITIONS).map(([from, to]) => [from, new Set(to)]),
);

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  return (
    typeof value === "string" &&
    (PIPELINE_STATUSES as readonly string[]).includes(value)
  );
}

/** Same-status writes are always allowed (they are no-ops, not transitions). */
export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITION_SET[from]?.has(to) ?? false;
}

export function allowedTransitions(from: PipelineStatus): PipelineStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

/** Follow-up is triggered when a live application has no company reply in 7 days. */
export const FOLLOW_UP_THRESHOLD_DAYS = 7;

/** Upper bound for an uploaded application document (open question default). */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_NAME_CHARS = 255;
export const MAX_DOCUMENT_VERSION_CHARS = 80;

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

export type JobRecord = {
  id: string;
  userId: string;
  company: string;
  position: string;
  source: string | null;
  appliedAt: string;
  deadline: string | null;
  status: PipelineStatus;
  lastResponseAt: string | null;
  notes: string | null;
  location: string | null;
  workType: string | null;
  priority: string | null;
  jobUrl: string | null;
  salaryRange: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  matchScore: number | null;
  interestLevel: string | null;
  techStack: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationRecord = {
  id: string;
  jobId: string;
  userId: string;
  communicationDate: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  summary: string;
  recruiterContact: string | null;
  createdAt: string;
};

export type StatusHistoryRecord = {
  id: string;
  jobId: string;
  fromStatus: PipelineStatus | null;
  toStatus: PipelineStatus;
  source: StatusSource;
  changedAt: string;
};

export type ReminderRecord = {
  id: string;
  jobId: string;
  userId: string;
  type: ReminderType;
  dueDate: string;
  completedAt: string | null;
  createdAt: string;
};

export type InterviewRecord = {
  id: string;
  jobId: string;
  userId: string;
  scheduledDate: string;
  scheduledTime: string;
  mode: InterviewMode;
  locationOrLink: string | null;
  interviewer: string | null;
  result: InterviewResult;
  notes: string | null;
  prepChecklist: { id: string; label: string; done: boolean }[];
  createdAt: string;
};

export type DocumentRecord = {
  id: string;
  userId: string;
  name: string;
  fileType: DocumentType;
  storagePath: string;
  sizeBytes: number;
  category: string | null;
  versionLabel: string | null;
  deletedAt: string | null;
  createdAt: string;
};
