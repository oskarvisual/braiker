import type { SystemStatus, SystemStatusState } from "@/modules/monitoring/system-status";

export type PublicSystemStatus = {
  status: Exclude<SystemStatusState, "disabled">;
  checkedAt: string;
  bots: SystemStatus["bots"];
  services: SystemStatus["services"];
};

function overallStatus(services: SystemStatus["services"]): PublicSystemStatus["status"] {
  if (services.some((service) => service.state === "unavailable")) return "unavailable";
  if (services.some((service) => service.state === "warning")) return "warning";
  return "healthy";
}

/** Public payload intentionally reuses only the already-sanitized aggregate health model. */
export function toPublicSystemStatus(status: SystemStatus): PublicSystemStatus {
  return { status: overallStatus(status.services), checkedAt: status.checkedAt.toISOString(), bots: status.bots, services: status.services };
}
