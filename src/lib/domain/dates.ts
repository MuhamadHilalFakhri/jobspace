/**
 * Pure date helpers. All business rules (application age, follow-up threshold,
 * statistics) go through these so results stay deterministic and unit-testable.
 */

export function toDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getTime());
  // Date-only strings are treated as UTC midnight so timezone offsets cannot
  // shift a calendar day while computing ages.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
  return new Date(value);
}

export function toDateOnly(value: string | Date): string {
  const d = value instanceof Date ? value : toDate(value);
  return d.toISOString().slice(0, 10);
}

export function dateKeyInTimeZone(
  value: Date = new Date(),
  timeZone = "Asia/Jakarta",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function today(now: Date = new Date()): string {
  return dateKeyInTimeZone(now);
}

export function addDays(value: string | Date, days: number): string {
  const d = toDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

export function diffDays(from: string | Date, to: string | Date = new Date()): number {
  const a = toDate(from).getTime();
  const b = toDate(to).getTime();
  return Math.floor((b - a) / 86_400_000);
}

export function isBefore(a: string | Date, b: string | Date): boolean {
  return toDate(a).getTime() < toDate(b).getTime();
}

export function isAfter(a: string | Date, b: string | Date): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  return toDateOnly(a) === toDateOnly(b);
}

export function isFutureDate(value: string | Date, now: Date = new Date()): boolean {
  return isAfter(value, toDateOnly(now));
}

export function daysUntil(value: string | Date, now: Date = new Date()): number {
  return diffDays(toDateOnly(now), value);
}

export function formatDateID(value: string | Date, opts?: { withTime?: boolean }): string {
  const d = toDate(value);
  const date = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  if (!opts?.withTime) return date;
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time}`;
}

export function formatTime(value: string): string {
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

export function startOfMonth(now: Date = new Date()): string {
  return `${dateKeyInTimeZone(now).slice(0, 7)}-01`;
}

export function startOfWeek(now: Date = new Date()): string {
  const d = toDate(dateKeyInTimeZone(now));
  const day = d.getUTCDay(); // 0 = Sunday, keep Monday as week start
  const shift = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + shift);
  return toDateOnly(d);
}
