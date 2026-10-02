/**
 * Authentication & session management:
 * - Passwords hashed with bcryptjs
 * - Sessions tracked in DB and signed into an HttpOnly cookie
 * - Server-side `getCurrentUser()` verifies ownership on every call
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { cookies } from "next/headers";
import { getDb } from "./data/db";

export const COOKIE_NAME = "jobspace_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET wajib diatur dan minimal 32 karakter.");
  }
  return new TextEncoder().encode(secret);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  workspaceName: string;
  timezone: string;
  theme: string;
  defaultView: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt.toISOString()],
  );

  const token = await new SignJWT({ sub: userId, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const verified = await jwtVerify(token, getSecretKey());
      const sid = verified.payload.sid as string | undefined;
      if (sid) {
        const db = getDb();
        await db.query(`DELETE FROM sessions WHERE id = $1`, [sid]);
      }
    } catch {
      // ignore invalid tokens on logout
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const verified = await jwtVerify(token, getSecretKey());
    const userId = verified.payload.sub as string | undefined;
    const sid = verified.payload.sid as string | undefined;
    if (!userId || !sid) return null;

    const db = getDb();
    // One indexed query validates the session and loads its active owner.
    const userRes = await db.query<{
      id: string;
      email: string;
      name: string | null;
      workspace_name: string;
      timezone: string;
      theme: string;
      default_view: string;
    }>(
      `SELECT u.id, u.email, u.name, u.workspace_name, u.timezone, u.theme, u.default_view
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2
         AND s.expires_at > $3 AND u.disabled_at IS NULL`,
      [sid, userId, new Date().toISOString()],
    );
    if (userRes.rowCount === 0) return null;

    const u = userRes.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      workspaceName: u.workspace_name,
      timezone: u.timezone,
      theme: u.theme,
      defaultView: u.default_view,
    };
  } catch (err) {
    return null;
  }
});

/** Fail-closed assertion for Route Handlers and Server Actions. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("Sesi tidak ditemukan. Silakan masuk untuk melanjutkan.");
    (error as unknown as { statusCode: number }).statusCode = 401;
    throw error;
  }
  return user;
}
