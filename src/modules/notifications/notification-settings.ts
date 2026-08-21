export const notificationEventIds = ["BOT_DEAD", "RISK_HALTED", "ORDER_FILLED", "ORDER_REJECTED", "SYNC_FAILED", "PORTFOLIO_DIVERGENCE"] as const;

export const notificationEvents = [
  { id: "BOT_DEAD", label: "Bot died", description: "A bot reaches zero capital and becomes history-only." },
  { id: "RISK_HALTED", label: "Risk halt", description: "A bot is blocked by a risk safeguard." },
  { id: "ORDER_FILLED", label: "Order filled", description: "A broker order completes." },
  { id: "ORDER_REJECTED", label: "Order rejected", description: "Alpaca rejects or fails an order." },
  { id: "SYNC_FAILED", label: "Sync failed", description: "Portfolio reconciliation cannot complete." },
  { id: "PORTFOLIO_DIVERGENCE", label: "Portfolio divergence", description: "Reconciliation detects a material mismatch." },
] as const;

export type NotificationEvent = (typeof notificationEventIds)[number];

const validEventIds = new Set<string>(notificationEvents.map((event) => event.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNotificationEvent(value: string): value is NotificationEvent {
  return validEventIds.has(value);
}

export function validateNotificationChannel(input: { enabled: boolean; url?: string; recipients?: string[]; events: string[] }) {
  if (!input.enabled) return null;
  const hasAlerts = input.events.length > 0 && input.events.every(isNotificationEvent);
  const secureUrl = !input.url || /^https:\/\//i.test(input.url);
  const validRecipients = !input.recipients || (input.recipients.length > 0 && input.recipients.every((recipient) => emailPattern.test(recipient)));
  if (!hasAlerts || !secureUrl || !validRecipients || (!input.url && !input.recipients)) return "A webhook needs an HTTPS URL and at least one alert.";
  return null;
}
