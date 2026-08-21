import { getSystemStatus, type SystemStatus } from "@/modules/monitoring/system-status";
import { dispatchPendingNotificationAlerts } from "@/modules/notifications/notification-delivery";
import { observeStatusFailureAlerts } from "@/modules/notifications/operational-alerts";

type MonitorDependencies = {
  getStatus: () => Promise<SystemStatus>;
  observe: (status: SystemStatus) => Promise<unknown>;
  dispatch: () => Promise<{ delivered: number; failed: number }>;
};

/** Samples system health, persists only material failures, then delivers selected durable alerts. */
export async function runOperationalAlertCheck(overrides: Partial<MonitorDependencies> = {}) {
  const dependencies: MonitorDependencies = {
    getStatus: overrides.getStatus ?? getSystemStatus,
    observe: overrides.observe ?? observeStatusFailureAlerts,
    dispatch: overrides.dispatch ?? dispatchPendingNotificationAlerts
  };
  const status = await dependencies.getStatus();
  await dependencies.observe(status);
  return dependencies.dispatch();
}
