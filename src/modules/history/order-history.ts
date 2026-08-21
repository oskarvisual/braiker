export const historyStates = ["OPEN", "IN_PROGRESS", "CLOSED", "REJECTED"] as const;
export type OrderHistoryState = (typeof historyStates)[number];

export function orderHistoryState(status: string): OrderHistoryState {
  const normalized = status.toUpperCase().replaceAll("-", "_");
  if (["PENDING", "NEW", "ACCEPTED", "HELD", "QUEUED", "PENDING_RISK", "PENDING_NEW"].includes(normalized)) return "OPEN";
  if (["PARTIALLY_FILLED", "PENDING_CANCEL", "PENDING_REPLACE", "CALCULATED"].includes(normalized)) return "IN_PROGRESS";
  if (["REJECTED", "FAILED", "SUSPENDED", "STOPPED"].includes(normalized)) return "REJECTED";
  return "CLOSED";
}
