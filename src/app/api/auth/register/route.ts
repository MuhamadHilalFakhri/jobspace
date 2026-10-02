import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/data/db";
import {
  hashPassword,
} from "@/lib/auth";
import { withApi, handleApiError } from "@/lib/api";
import {
  cleanupRateLimitEntries,
  consumeRateLimit,
  getRequestAddress,
} from "@/lib/auth-rate-limit";
import { readBoundedRequest } from "@/lib/bounded-request";
import { registerSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

/** POST /api/auth/register */
export const POST = withApi(async (req: NextRequest) => {
  try {
    const body = await (await readBoundedRequest(req, 16 * 1024)).json();
    const input = registerSchema.parse(body);
    const email = input.email.toLowerCase().trim();
    const address = getRequestAddress(req.headers);
    const limited = await consumeRateLimit([
      { key: "register-address:" + address, limit: 5 },
    ]);
    await cleanupRateLimitEntries();
    if (limited) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi setelah beberapa saat.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const db = getDb();
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    await db.query(
      "INSERT INTO users (id, email, password_hash, name) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING",
      [userId, email, passwordHash, input.name ?? null],
    );

    // Keep response shape/status identical for existing and new addresses.
    return NextResponse.json(
      { ok: true, message: "Jika alamat dapat digunakan, akun siap. Silakan masuk." },
      { status: 202 },
    );
  } catch (err) {
    return handleApiError(err);
  }
});
