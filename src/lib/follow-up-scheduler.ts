import "server-only";
import { after } from "next/server";
import { runFollowUpSweep } from "@/lib/services/jobs.service";

const SWEEP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const scheduledSweeps = new Map<string, number>();

/** Schedule one deferred follow-up sweep per user in each cooldown window. */
export function scheduleFollowUpSweep(userId: string): void {
  const now = Date.now();
  if ((scheduledSweeps.get(userId) ?? 0) > now) return;
  scheduledSweeps.set(userId, now + SWEEP_COOLDOWN_MS);

  after(async () => {
    try {
      await runFollowUpSweep(userId);
    } catch (error) {
      scheduledSweeps.delete(userId);
      console.error("[jobs] deferred follow-up sweep failed", error);
    }
  });
}
