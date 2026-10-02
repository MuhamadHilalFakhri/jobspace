/**
 * UI constants shared across components: status colors, formatters, and
 * presentational mappings. Pure data only.
 */
import type { PipelineStatus } from "./domain/schema";
import { today } from "./domain/dates";

/** Notion-style subtle labels — never oversaturated. */
export const STATUS_STYLES: Record<PipelineStatus, string> = {
  Draft: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  Dilamar: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  "Perlu Follow-up": "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  Wawancara: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  Penawaran: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  Diterima: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  Ditolak: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  Ditutup: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export const STATUS_DOTS: Record<PipelineStatus, string> = {
  Draft: "bg-neutral-400",
  Dilamar: "bg-blue-500",
  "Perlu Follow-up": "bg-amber-500",
  Wawancara: "bg-violet-500",
  Penawaran: "bg-teal-500",
  Diterima: "bg-emerald-500",
  Ditolak: "bg-rose-500",
  Ditutup: "bg-neutral-500",
};

export const PRIORITY_STYLES: Record<string, string> = {
  Rendah: "text-neutral-500",
  Sedang: "text-amber-600 dark:text-amber-400",
  Tinggi: "text-rose-600 dark:text-rose-400",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDateOnlyUtc(value: string | null | undefined): Date | null {
  const datePart = value?.trim().slice(0, 10);
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const date = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) {
    return null;
  }
  return date;
}

export function relativeDays(iso: string | null | undefined): string {
  const target = parseDateOnlyUtc(iso);
  if (!target) return "—";
  const todayUtc = Date.parse(`${today()}T00:00:00Z`);
  const diff = Math.round((target.getTime() - todayUtc) / 86_400_000);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  if (diff > 1) return `${diff} hari lagi`;
  return `${Math.abs(diff)} hari lalu`;
}

export function formatDateTimeID(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function formatDateID(iso: string | null | undefined): string {
  const d = parseDateOnlyUtc(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
