export type ManagerBrokerClock = { isOpen: boolean; timestamp: Date; nextOpen: Date; nextClose: Date };

export function managerMarketClockContext(clock: ManagerBrokerClock | null) {
  if (!clock) return { status: "UNKNOWN" as const };
  return {
    status: clock.isOpen ? "OPEN" as const : "CLOSED" as const,
    checkedAt: clock.timestamp.toISOString(),
    nextOpen: clock.nextOpen.toISOString(),
    nextClose: clock.nextClose.toISOString()
  };
}
