export const notificationEventIds = [
  "BOT_DEAD",
  "RISK_HALTED",
  "ORDER_FILLED",
  "ORDER_REJECTED",
  "SYNC_FAILED",
  "PORTFOLIO_DIVERGENCE",
  "SYSTEM_STATUS_FAILURE",
  "OPENAI_QUOTA_EXHAUSTED",
  "BOT_MANAGER_DAILY_REPORT",
  "BOT_MANAGER_WEEKLY_REPORT",
  "BOT_MANAGER_MONTHLY_REPORT"
] as const;

export const notificationEvents = [
  { id: "BOT_DEAD", label: "Bot died", description: "A bot reaches zero capital and becomes history-only." },
  { id: "RISK_HALTED", label: "Risk halt", description: "A bot is blocked by a risk safeguard." },
  { id: "ORDER_FILLED", label: "Order filled", description: "A broker order completes." },
  { id: "ORDER_REJECTED", label: "Order rejected", description: "Alpaca rejects or fails an order." },
  { id: "SYNC_FAILED", label: "Sync failed", description: "Portfolio reconciliation cannot complete." },
  { id: "PORTFOLIO_DIVERGENCE", label: "Portfolio divergence", description: "Reconciliation detects a material mismatch." },
  { id: "SYSTEM_STATUS_FAILURE", label: "System status failure", description: "A required service such as MySQL, the worker, the stream, or Alpaca needs attention." },
  { id: "OPENAI_QUOTA_EXHAUSTED", label: "OpenAI quota exhausted", description: "OpenAI rejected an advisory request because quota or billing is unavailable." },
  { id: "BOT_MANAGER_DAILY_REPORT", label: "Daily Bot Manager report", description: "A daily paper-only summary of bots and order activity." },
  { id: "BOT_MANAGER_WEEKLY_REPORT", label: "Weekly Bot Manager report", description: "A weekly paper-only summary of bots and order activity." },
  { id: "BOT_MANAGER_MONTHLY_REPORT", label: "Monthly Bot Manager report", description: "A monthly paper-only summary of bots and order activity." },
] as const;

export type NotificationEvent = (typeof notificationEventIds)[number];

const validEventIds = new Set<string>(notificationEvents.map((event) => event.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNotificationEvent(value: string): value is NotificationEvent {
  return validEventIds.has(value);
}

type WebhookNotificationChannel = {
  enabled: boolean;
  url?: string;
  events: string[];
};

type EmailNotificationChannel = {
  enabled: boolean;
  recipients: string[];
  events: string[];
};

function hasSelectedEvents(events: string[]) {
  return events.length > 0 && events.every(isNotificationEvent);
}

export function validateWebhookNotificationChannel(input: WebhookNotificationChannel) {
  if (!input.enabled) return null;
  if (!input.url || !/^https:\/\//i.test(input.url) || !hasSelectedEvents(input.events)) {
    return "Webhook alerts need an HTTPS URL and at least one alert.";
  }
  return null;
}

export function validateEmailNotificationChannel(input: EmailNotificationChannel) {
  if (!input.enabled) return null;
  const validRecipients = input.recipients.length > 0 && input.recipients.every((recipient) => emailPattern.test(recipient));
  if (!validRecipients) return "Email alerts need at least one valid recipient.";
  if (!hasSelectedEvents(input.events)) return "Select at least one email alert.";
  return null;
}

/** @deprecated Use the channel-specific validators for new notification flows. */
export function validateNotificationChannel(input: { enabled: boolean; url?: string; recipients?: string[]; events: string[] }) {
  if (input.recipients) {
    return validateEmailNotificationChannel({ enabled: input.enabled, recipients: input.recipients, events: input.events });
  }
  return validateWebhookNotificationChannel({ enabled: input.enabled, url: input.url, events: input.events });
}

export function validateTelegramNotificationChannel(input: { enabled: boolean; configured: boolean; paired: boolean; events: string[] }) {
  if (!input.enabled) return null;
  if (!input.configured) return "Telegram needs a server-side bot token before alerts can be enabled.";
  if (!input.paired) return "Pair the Bot Manager chat before enabling Telegram alerts.";
  if (!hasSelectedEvents(input.events)) return "Select at least one Telegram alert.";
  return null;
}

/** The master switch is independent from a configured environment token. */
export function validateTelegramManagerChannel(input: { enabled: boolean; configured: boolean }) {
  if (!input.enabled || input.configured) return null;
  return "Telegram needs a server-side bot token before Bot Manager can be enabled.";
}

export function validateTelegramMessageAccess(input: { receiveMessages: boolean; configured: boolean; paired: boolean }) {
  if (!input.receiveMessages) return null;
  if (!input.configured) return "Telegram needs a server-side bot token before messages can be enabled.";
  if (!input.paired) return "Pair the Bot Manager chat before enabling Telegram messages.";
  return null;
}
