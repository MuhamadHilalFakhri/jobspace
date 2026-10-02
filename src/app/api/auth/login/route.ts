import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/db";
import {
  createSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { readBoundedRequest } from "@/lib/bounded-request";
import { handleApiError, jsonError } from "@/lib/api";
import {
  cleanupRateLimitEntries,
  consumeRateLimit,
  getRequestAddress,
} from "@/lib/auth-rate-limit";
import { loginSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

const dummyHashPromise = hashPassword("jobspace-nonexistent-account-dummy");

/** POST /api/auth/login */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = await (await readBoundedRequest(req, 16 * 1024)).json();
    const input = loginSchema.parse(body);
    const email = input.email.toLowerCase().trim();
    const address = getRequestAddress(req.headers);
    const limited = await consumeRateLimit([
      { key: "login-email:" + email, limit: 10 },
      { key: "login-address:" + address, limit: 60 },
    ]);
    await cleanupRateLimitEntries();
    if (limited) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi setelah beberapa saat.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const db = getDb();

    const res = await db.query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM users WHERE email = $1 AND disabled_at IS NULL`,
      [email],
    );

    const passwordHash = res.rows[0]?.password_hash ?? await dummyHashPromise;
    const valid = await verifyPassword(input.password, passwordHash);
    if (res.rowCount === 0 || !valid) {
      return jsonError("Email atau kata sandi salah.", 401, { code: "INVALID_CREDENTIALS" });
    }

    const token = await createSession(res.rows[0].id);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
};
