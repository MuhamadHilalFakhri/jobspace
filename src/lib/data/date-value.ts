/** Convert PostgreSQL DATE values and SQLite date strings to YYYY-MM-DD. */
export function dateValueToISO(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "";
    const year = String(value.getFullYear()).padStart(4, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return typeof value === "string" ? value.slice(0, 10) : "";
}
