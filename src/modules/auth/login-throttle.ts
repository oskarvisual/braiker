export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginThrottleState = {
  failures: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

export function nextLoginThrottle(current: LoginThrottleState, succeeded: boolean, now: Date, limit: number): LoginThrottleState {
  if (succeeded) return { failures: 0, windowStartedAt: now, blockedUntil: null };
  const inWindow = now.getTime() - current.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
  const failures = (inWindow ? current.failures : 0) + 1;
  return {
    failures,
    windowStartedAt: inWindow ? current.windowStartedAt : now,
    blockedUntil: failures >= limit ? new Date(now.getTime() + LOGIN_WINDOW_MS) : null
  };
}
