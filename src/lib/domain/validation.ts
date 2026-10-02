/**
 * Validation schemas shared by Route Handlers and forms. Server-side validation
 * is mandatory. Compatible with Zod v4.
 */
import { z } from "zod";
import { normalizeRupiahAmount } from "./rupiah";
import { today } from "./dates";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  DOCUMENT_CATEGORIES,
  INTERVIEW_MODES,
  INTERVIEW_RESULTS,
  MAX_DOCUMENT_NAME_CHARS,
  MAX_DOCUMENT_VERSION_CHARS,
  MAX_PAGE_BLOCKS,
  MAX_PAGE_BLOCK_TEXT_CHARS,
  MAX_PAGE_CONTENT_CHARS,
  OPPORTUNITY_STATUSES,
  PAGE_BLOCK_TYPES,
  PAGE_ICON_NAMES,
  PIPELINE_STATUSES,
  PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  TEMPLATE_TYPES,
} from "./schema";

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function optionalHttpUrl(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .refine((value) => value === "" || isHttpUrl(value), "Gunakan URL yang diawali http:// atau https://")
    .optional()
    .nullable();
}

export const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid").max(320),
  password: z.string().min(1, "Kata sandi wajib diisi").max(200),
});
export const restoreJobSchema = z.object({ restore: z.literal(true) }).strict();

export const registerSchema = z.object({
  email: z.string().trim().email("Format email tidak valid").max(320),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(200),
  name: z.string().trim().max(120).optional(),
});

export const universalSearchQuerySchema = z.string().trim().min(1).max(100);
export const uuidSchema = z.string().uuid("ID tidak valid");
export const rupiahAmountSchema = z
  .string()
  .trim()
  .max(19)
  .refine(
    (value) => /^\d{1,15}$/.test(value) || /^\d{1,3}(?:\.\d{3})+$/.test(value),
    "Masukkan nominal rupiah berupa angka, contoh 1.000.000",
  )
  .transform(normalizeRupiahAmount);

export const documentUploadSchema = z.object({
  name: z.string().trim().min(1, "Nama file wajib diisi").max(MAX_DOCUMENT_NAME_CHARS),
  category: z.enum(DOCUMENT_CATEGORIES),
  versionLabel: z.string().trim().max(MAX_DOCUMENT_VERSION_CHARS).nullable().optional(),
  linkToJobId: z.string().uuid().nullable().optional(),
});

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Gunakan format tanggal YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Tanggal kalender tidak valid");

const isoDate = isoDateSchema;
export const isoTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Gunakan waktu 00:00 sampai 23:59");

export const jobStatusSchema = z.enum(PIPELINE_STATUSES);

export const createJobSchema = z
  .object({
    company: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200),
    companyId: z.string().uuid().optional().nullable(),
    position: z.string().trim().min(1, "Posisi wajib diisi").max(200),
    source: z.string().trim().max(200).optional().nullable(),
    appliedAt: isoDate,
    deadline: isoDate.optional().nullable(),
    status: jobStatusSchema.default("Draft"),
    notes: z.string().max(10000).optional().nullable(),
    location: z.string().trim().max(200).optional().nullable(),
    workType: z.string().trim().max(100).optional().nullable(),
    priority: z.enum(PRIORITIES).optional().nullable(),
    jobUrl: optionalHttpUrl(2000),
    salaryRange: rupiahAmountSchema.optional().nullable(),
    nextAction: z.string().trim().max(200).optional().nullable(),
    nextActionDate: isoDate.optional().nullable(),
    matchScore: z.number().int().min(0).max(100).optional().nullable(),
    interestLevel: z.string().trim().max(100).optional().nullable(),
    techStack: z.array(z.string().trim().max(60)).max(40).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.deadline && val.deadline < val.appliedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline"],
        message: "Tenggat tidak boleh lebih awal dari tanggal lamar",
      });
    }
    if (val.appliedAt > today()) {
      ctx.addIssue({
        code: "custom",
        path: ["appliedAt"],
        message: "Tanggal lamar tidak boleh di masa depan",
      });
    }
  });

export const patchJobSchema = z
  .object({
    company: z.string().trim().min(1).max(200).optional(),
    position: z.string().trim().min(1).max(200).optional(),
    source: z.string().trim().max(200).nullable().optional(),
    appliedAt: isoDate.optional(),
    deadline: isoDate.nullable().optional(),
    status: jobStatusSchema.optional(),
    notes: z.string().max(10000).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    workType: z.string().trim().max(100).nullable().optional(),
    priority: z.enum(PRIORITIES).nullable().optional(),
    jobUrl: optionalHttpUrl(2000),
    salaryRange: rupiahAmountSchema.nullable().optional(),
    nextAction: z.string().trim().max(200).nullable().optional(),
    nextActionDate: isoDate.nullable().optional(),
    matchScore: z.number().int().min(0).max(100).nullable().optional(),
    interestLevel: z.string().trim().max(100).nullable().optional(),
    techStack: z.array(z.string().trim().max(60)).max(40).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.appliedAt && value.appliedAt > today()) {
      ctx.addIssue({
        code: "custom",
        path: ["appliedAt"],
        message: "Tanggal lamar tidak boleh di masa depan",
      });
    }
    if (value.appliedAt && value.deadline && value.deadline < value.appliedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline"],
        message: "Tenggat tidak boleh lebih awal dari tanggal lamar",
      });
    }
  });

export const communicationSchema = z
  .object({
    communicationDate: isoDate,
    channel: z.enum(COMMUNICATION_CHANNELS),
    direction: z.enum(COMMUNICATION_DIRECTIONS),
    summary: z.string().trim().min(1, "Ringkasan wajib diisi").max(5000),
    recruiterContact: z.string().trim().max(300).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.communicationDate > today()) {
      ctx.addIssue({ code: "custom", path: ["communicationDate"], message: "Tanggal komunikasi tidak boleh di masa depan" });
    }
  });

export const interviewSchema = z
  .object({
    scheduledDate: isoDate,
    scheduledTime: isoTimeSchema,
    mode: z.enum(INTERVIEW_MODES),
    locationOrLink: z.string().trim().max(2000).optional().nullable(),
    interviewer: z.string().trim().max(200).optional().nullable(),
    notes: z.string().max(10000).optional().nullable(),
    prepChecklist: z.array(z.object({
      id: z.string().trim().min(1).max(60),
      label: z.string().trim().min(1).max(160),
      done: z.boolean(),
    })).max(20).optional(),
  });

export const interviewPatchSchema = z
  .object({
    scheduledDate: isoDate.optional(),
    scheduledTime: isoTimeSchema.optional(),
    mode: z.enum(INTERVIEW_MODES).optional(),
    locationOrLink: z.string().trim().max(2000).optional().nullable(),
    interviewer: z.string().trim().max(200).optional().nullable(),
    result: z.enum(INTERVIEW_RESULTS).optional(),
    notes: z.string().max(10000).nullable().optional(),
    prepChecklist: z.array(z.object({
      id: z.string().trim().min(1).max(60),
      label: z.string().trim().min(1).max(160),
      done: z.boolean(),
    })).max(20).optional(),
  });

export const templateSchema = z
  .object({
    name: z.string().trim().min(1, "Nama template wajib diisi").max(200),
    type: z.enum(TEMPLATE_TYPES),
    content: z.string().trim().min(1, "Isi template wajib diisi").max(20000),
  });

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200),
  industry: z.string().trim().max(120).optional().nullable(),
  website: optionalHttpUrl(500),
  linkedin: optionalHttpUrl(500),
  location: z.string().trim().max(200).optional().nullable(),
  size: z.string().trim().max(100).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

export const patchCompanySchema = z.object({
  name: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200).optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  website: optionalHttpUrl(500),
  linkedin: optionalHttpUrl(500),
  location: z.string().trim().max(200).nullable().optional(),
  size: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export const createOpportunitySchema = z.object({
  position: z.string().trim().min(1, "Posisi wajib diisi").max(200),
  company: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200),
  source: z.string().trim().max(200).nullable().optional(),
  url: optionalHttpUrl(2000),
  location: z.string().trim().max(200).nullable().optional(),
  salaryRange: rupiahAmountSchema.nullable().optional(),
  deadline: isoDateSchema.nullable().optional(),
  interestLevel: z.string().trim().max(100).nullable().optional(),
  techStack: z.array(z.string().trim().max(60)).max(40).optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
});

export const patchOpportunitySchema = z.object({
  position: z.string().trim().min(1).max(200).optional(),
  company: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().max(200).nullable().optional(),
  url: optionalHttpUrl(2000),
  location: z.string().trim().max(200).nullable().optional(),
  salaryRange: rupiahAmountSchema.nullable().optional(),
  deadline: isoDateSchema.nullable().optional(),
  interestLevel: z.string().trim().max(100).nullable().optional(),
  techStack: z.array(z.string().trim().max(60)).max(40).optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
});

export const patchCommunicationSchema = z.object({
  communicationDate: isoDate.optional(),
  channel: z.enum(COMMUNICATION_CHANNELS).optional(),
  direction: z.enum(COMMUNICATION_DIRECTIONS).optional(),
  summary: z.string().trim().min(1).max(5000).optional(),
  recruiterContact: z.string().trim().max(300).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Pilih minimal satu data yang akan diperbarui");

export const patchReminderSchema = z.object({ dueDate: isoDateSchema });

export const workspacePreferencesPatchSchema = z.object({
  weeklyApplicationGoal: z.number().int().min(1).max(100).optional(),
  weeklyFollowUpGoal: z.number().int().min(1).max(100).optional(),
  quickNotes: z.string().max(10000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Tidak ada pengaturan yang diperbarui");

export const patchDocumentSchema = z.object({
  name: z.string().trim().min(1, "Nama file wajib diisi").max(MAX_DOCUMENT_NAME_CHARS).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  versionLabel: z.string().trim().max(MAX_DOCUMENT_VERSION_CHARS).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Pilih minimal satu data yang akan diperbarui");

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Nama tugas wajib diisi").max(300),
  jobId: z.string().uuid().optional().nullable(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: isoDateSchema.optional().nullable(),
  taskType: z.enum(TASK_TYPES).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const taskFilterSchema = z.object({
  jobId: z.string().uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export const patchTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: isoDateSchema.nullable().optional(),
  taskType: z.enum(TASK_TYPES).optional(),
  notes: z.string().max(5000).nullable().optional(),
  /** Convenience flag toggling completed_at without exposing a raw timestamp. */
  completed: z.boolean().optional(),
});

export const documentLinkSchema = z.object({
  documentId: z.string().uuid("Dokumen yang dipilih tidak valid"),
});

export const pageMetaSchema = z.object({
  title: z.string().trim().min(1, "Judul halaman wajib diisi").max(200),
  icon: z.enum(PAGE_ICON_NAMES).nullable().optional(),
});

export const createPageSchema = pageMetaSchema.extend({
  section: z.string().max(60).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const saveBlocksSchema = z.object({
  blocks: z.array(
    z.object({
      type: z.enum(PAGE_BLOCK_TYPES),
    content: z.record(z.string().max(16), z.unknown()),
      position: z.number().int().min(0).max(MAX_PAGE_BLOCKS - 1),
    }),
  ).max(MAX_PAGE_BLOCKS, `Halaman maksimal memiliki ${MAX_PAGE_BLOCKS} blok`),
}).superRefine(({ blocks }, ctx) => {
  let totalTextChars = 0;
  blocks.forEach((block, index) => {
    const text = block.content.text;
    if (typeof text !== "string") {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "content", "text"], message: "Teks blok harus berupa string" });
      return;
    }
    const allowedKeys = block.type === "todo" ? ["text", "checked"] : block.type === "callout" ? ["text", "icon"] : ["text"];
    if (Object.keys(block.content).some((key) => !allowedKeys.includes(key))) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "content"], message: "Konten blok memuat field yang tidak dikenal" });
    }
    totalTextChars += text.length;
    if (text.length > MAX_PAGE_BLOCK_TEXT_CHARS) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "content", "text"], message: `Setiap blok maksimal ${MAX_PAGE_BLOCK_TEXT_CHARS.toLocaleString("id-ID")} karakter` });
    }
    if (block.type === "todo" && block.content.checked !== undefined && typeof block.content.checked !== "boolean") {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "content", "checked"], message: "Status checklist tidak valid" });
    }
    if (block.type === "callout" && block.content.icon !== undefined && (typeof block.content.icon !== "string" || block.content.icon.length > 64)) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "content", "icon"], message: "Ikon callout maksimal 64 karakter" });
    }
  });
  if (totalTextChars > MAX_PAGE_CONTENT_CHARS) {
    ctx.addIssue({ code: "custom", path: ["blocks"], message: `Total teks halaman maksimal ${MAX_PAGE_CONTENT_CHARS.toLocaleString("id-ID")} karakter` });
  }
});

export function formErrorsFromZod(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "_");
    fields[field] ??= issue.message;
  }
  return fields;
}

export const importRowSchema = z.object({
  company: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200),
  position: z.string().trim().min(1, "Posisi wajib diisi").max(200),
  source: z.string().trim().max(200).optional(),
  appliedAt: isoDate,
  deadline: isoDate.optional(),
  status: jobStatusSchema.default("Draft"),
  notes: z.string().max(10000).optional(),
  salaryRange: rupiahAmountSchema.optional(),
  jobUrl: optionalHttpUrl(2000),
});

export const jobFilterSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    status: jobStatusSchema.optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    source: z.string().trim().max(200).optional(),
    hasDocument: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v === true || v === "true",
      ),
    archived: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v === true || v === "true",
      ),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["appliedAt", "updatedAt", "company", "status"]).default("appliedAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type PatchJobInput = z.infer<typeof patchJobSchema>;
export type CommunicationInput = z.infer<typeof communicationSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
export type InterviewPatchInput = z.infer<typeof interviewPatchSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type JobFilter = z.infer<typeof jobFilterSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
