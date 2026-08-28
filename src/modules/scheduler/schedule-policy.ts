const supportedIntervals = [1, 5, 15, 30, 60] as const;

/** node-cron uses six fields here; wake only once for each durable minute run. */
export const marketCycleWakeupCron = "0 * * * * *";

export type SynchronizationInterval = (typeof supportedIntervals)[number];

export function reconciliationCron(intervalMinutes: number): string {
  if (!supportedIntervals.includes(intervalMinutes as SynchronizationInterval)) throw new Error("Unsupported synchronization interval");
  return intervalMinutes === 60 ? "0 * * * *" : `*/${intervalMinutes} * * * *`;
}

export function intervalFromCron(expression: string): SynchronizationInterval | null {
  if (expression === "0 * * * *") return 60;
  const match = expression.match(/^\*\/(1|5|15|30) \* \* \* \*$/);
  return match ? Number(match[1]) as SynchronizationInterval : null;
}

export function isIntervalCronDue(expression: string, now: Date): boolean {
  const interval = intervalFromCron(expression);
  if (!interval) return false;
  return interval === 60 ? now.getUTCMinutes() === 0 : now.getUTCMinutes() % interval === 0;
}

/** A durable task with a future resume time is intentionally not due yet. */
export function isTaskRunDue(nextRunAt: Date | null, now = new Date()) {
  return !nextRunAt || nextRunAt.getTime() <= now.getTime();
}

/** Alpaca's exchange-aware next_open covers weekends, holidays, and early sessions. */
export function marketCycleResumeAt(clock: { isOpen: boolean; nextOpen: Date }) {
  return clock.isOpen ? null : clock.nextOpen;
}
