import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestMetrics = {
  queryCount: number;
  queryDurationMs: number;
  connectionWaitMs: number;
};

const requestMetrics = new AsyncLocalStorage<RequestMetrics>();

export function withRequestMetrics<T>(run: (metrics: RequestMetrics) => Promise<T>) {
  const metrics: RequestMetrics = {
    queryCount: 0,
    queryDurationMs: 0,
    connectionWaitMs: 0,
  };
  return requestMetrics.run(metrics, () => run(metrics));
}

export function recordDatabaseQuery(durationMs: number) {
  const metrics = requestMetrics.getStore();
  if (!metrics) return;
  metrics.queryCount += 1;
  metrics.queryDurationMs += durationMs;
}

export function recordDatabaseConnectionWait(durationMs: number) {
  const metrics = requestMetrics.getStore();
  if (metrics) metrics.connectionWaitMs += durationMs;
}
