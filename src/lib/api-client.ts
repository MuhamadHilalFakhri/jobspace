"use client";

/**
 * Typed API client for the browser. All calls include credentials (session
 * cookie) and map server errors into a consistent shape for UI feedback.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const GET_CACHE_TTL_MS = 10_000;
const getCache = new Map<string, { value: unknown; expiresAt: number }>();
const pendingGets = new Map<string, Promise<unknown>>();
let cacheVersion = 0;

function invalidateGetCache() {
  cacheVersion += 1;
  getCache.clear();
  pendingGets.clear();
}

function cachedGet<T>(url: string): Promise<T> {
  const cached = getCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);

  const pending = pendingGets.get(url);
  if (pending) return pending as Promise<T>;

  const requestVersion = cacheVersion;
  let requestPromise: Promise<T>;
  requestPromise = request<T>(url)
    .then((value) => {
      if (requestVersion === cacheVersion) {
        getCache.set(url, { value, expiresAt: Date.now() + GET_CACHE_TTL_MS });
      }
      return value;
    })
    .finally(() => {
      if (pendingGets.get(url) === requestPromise) pendingGets.delete(url);
    });
  pendingGets.set(url, requestPromise);
  return requestPromise;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const res = await fetch(url, {
    credentials: "same-origin",
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    ...init,
  });

  if (res.status === 401) {
    // Fail closed: redirect to login on session expiry.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError("Sesi berakhir. Silakan masuk kembali.", 401);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (e.g. file download) — pass through
  }

  if (!res.ok) {
    const err = data as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiError(err?.error || `Permintaan gagal (${res.status})`, res.status, err?.fields);
  }

  if (method !== "GET") invalidateGetCache();

  return data as T;
}

export const api = {
  get: <T>(url: string) => cachedGet<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: "POST", body: form }),
};
