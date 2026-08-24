import type { SystemStatus } from "@/modules/monitoring/system-status";

const MAX_DETAIL_LENGTH = 180;

export function isSystemReportRequest(content: string) {
  const normalized = content.trim().toLocaleLowerCase();
  return normalized === "/status" || normalized === "/report" || /\b(?:system report|system status|reporte de sistema|reporte del sistema|estado del sistema)\b/i.test(normalized);
}

function compactDetail(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_DETAIL_LENGTH ? `${normalized.slice(0, MAX_DETAIL_LENGTH - 1)}…` : normalized;
}

/** Formats only the already-sanitized status model and read-only daily operational summary. */
export function buildManagerSystemReport(status: SystemStatus, dailyReport: string) {
  const services = status.services.map((service) => `${service.label}: ${service.state.toUpperCase()} — ${compactDetail(service.detail)}`).join("\n");
  return [
    `System report · checked ${status.checkedAt.toISOString()}.`,
    `Current bot fleet: ${status.bots.on} on, ${status.bots.off} off, ${status.bots.dead} dead.`,
    "Service health:",
    services,
    "Daily operating report:",
    dailyReport,
  ].join("\n");
}
