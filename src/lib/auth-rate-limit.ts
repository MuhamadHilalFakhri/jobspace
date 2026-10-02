import { createHash } from "node:crypto";
import { getDb } from "./data/db";

export type RateLimitRule = {
  key: string;
  limit: number;
};

export async function consumeRateLimit(
  rules: RateLimitRule[],
  windowMs = 15 * 60 * 1000,
): Promise<{ retryAfterSeconds: number } | null> {
  const db = getDb();
  const now = Date.now();
  const startedAt = new Date(now).toISOString();
  const cutoff = new Date(now - windowMs).toISOString();
  const sql = [
    "INSERT INTO auth_rate_limits (rate_key, attempts, window_started_at)",
    "VALUES ($1, 1, $3)",
    "ON CONFLICT (rate_key) DO UPDATE SET",
    "attempts = CASE WHEN auth_rate_limits.window_started_at <= $2",
    "THEN 1 ELSE auth_rate_limits.attempts + 1 END,",
    "window_started_at = CASE WHEN auth_rate_limits.window_started_at <= $2",
    "THEN $3 ELSE auth_rate_limits.window_started_at END",
    "RETURNING attempts, window_started_at",
  ].join("\n");

  for (const rule of rules) {
    const key = createHash("sha256").update(rule.key).digest("hex");
    const result = await db.query<{
      attempts: number | string;
      window_started_at: string;
    }>(sql, [key, cutoff, startedAt]);
    const row = result.rows[0];
    if (Number(row.attempts) > rule.limit) {
      const resetAt = new Date(row.window_started_at).getTime() + windowMs;
      return { retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    }
  }

  return null;
}

export function getRequestAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (headers.get("x-real-ip")?.trim() || forwarded || "unknown").slice(0, 200);
}

let cleanupCounter = 0;
export async function cleanupRateLimitEntries(): Promise<void> {
  cleanupCounter += 1;
  if (cleanupCounter % 100 !== 0) return;
  const db = getDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.query("DELETE FROM auth_rate_limits WHERE window_started_at < $1", [cutoff]);
}
