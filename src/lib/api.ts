/**
 * Centralized HTTP helpers: consistent JSON success/error envelopes, Zod error
 * mapping to field-level messages, and ownership-safe `withUser` wrapper.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type AuthUser } from "./auth";
import { DomainError } from "./services/jobs.service";
import { withRequestMetrics, type RequestMetrics } from "./server-metrics";

export type ApiError = {
  error: string;
  code?: string;
  fields?: Record<string, string>;
  details?: unknown;
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Omit<ApiError, "error">,
) {
  return NextResponse.json({ error: message, ...extra } satisfies ApiError, { status });
}

/** Maps thrown domain/validation errors to consistent HTTP responses. */
export function handleApiError(err: unknown): NextResponse<ApiError> {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return jsonError("Validasi gagal. Periksa field yang ditandai.", 400, {
      code: "VALIDATION_ERROR",
      fields,
    });
  }

  if (err instanceof DomainError) {
    return jsonError(err.message, err.statusCode, {
      code: "DOMAIN_ERROR",
      details: err.details,
    });
  }

  const anyErr = err as { statusCode?: number; message?: string };
  if (anyErr?.statusCode === 401) {
    return jsonError(
      "Sesi tidak ditemukan. Silakan masuk untuk melanjutkan.",
      401,
      { code: "UNAUTHENTICATED" },
    );
  }
  if (anyErr?.statusCode === 413 || anyErr?.statusCode === 429) {
    return jsonError(
      anyErr.message || "Request tidak dapat diproses.",
      anyErr.statusCode,
      { code: anyErr.statusCode === 413 ? "PAYLOAD_TOO_LARGE" : "RATE_LIMITED" },
    );
  }

  const error = err as { name?: string; code?: string };
  console.error("[api error]", {
    name: error?.name ?? "Error",
    code: error?.code,
  });
  return jsonError("Terjadi kesalahan pada server. Coba lagi.", 500, {
    code: "INTERNAL_ERROR",
  });
}

/** Wraps a handler with authentication; returns 401 without a valid session. */
export function withUser<T extends unknown[]>(
  handler: (user: AuthUser, ...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    return withRequestMetrics(async (metrics) => {
      const startedAt = performance.now();
      let response: NextResponse;
      try {
        const user = await getCurrentUser();
        if (!user) {
          response = jsonError(
            "Sesi tidak ditemukan. Silakan masuk untuk melanjutkan.",
            401,
            { code: "UNAUTHENTICATED" },
          );
        } else {
          response = await handler(user, ...args);
        }
      } catch (err) {
        response = handleApiError(err);
      }
      addServerTiming(response, metrics, performance.now() - startedAt);
      return response;
    });
  };
}

/** Wraps a handler that manages auth itself (register/login/logout). */
export function withApi<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    return withRequestMetrics(async (metrics) => {
      const startedAt = performance.now();
      let response: NextResponse;
      try {
        response = await handler(...args);
      } catch (err) {
        response = handleApiError(err);
      }
      addServerTiming(response, metrics, performance.now() - startedAt);
      return response;
    });
  };
}

function addServerTiming(
  response: NextResponse,
  metrics: RequestMetrics,
  totalDurationMs: number,
) {
  response.headers.set(
    "Server-Timing",
    `db;dur=${metrics.queryDurationMs.toFixed(1)}, db-wait;dur=${metrics.connectionWaitMs.toFixed(1)}, db-queries;desc="${metrics.queryCount}", total;dur=${totalDurationMs.toFixed(1)}`,
  );
}
