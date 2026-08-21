import nodemailer from "nodemailer";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isNotificationEvent, type NotificationEvent } from "@/modules/notifications/notification-settings";

const DELIVERY_RETRY_MS = 10 * 60_000;

export type AlertForDelivery = {
  id: string;
  eventType: string;
  severity: string;
  subject: string;
  message: string;
  firstObservedAt: Date;
  lastObservedAt: Date;
  webhookDeliveredAt: Date | null;
  webhookLastAttemptAt: Date | null;
  emailDeliveredAt: Date | null;
  emailLastAttemptAt: Date | null;
};

type WebhookSettings = { enabled: boolean; url: string | null; events: string[] };
type EmailSettings = { enabled: boolean; smtpConfigured: boolean; recipients: string[]; events: string[] };
export type DeliveryPlanInput = { alert: AlertForDelivery; now: Date; retryAfterMs: number; webhook: WebhookSettings; email: EmailSettings };
export type PlannedDelivery = { channel: "webhook" | "email"; destination: string };
type NotificationDeliveryDb = Pick<PrismaClient, "notificationSettings" | "notificationAlert">;
type AlertSender = (recipients: string[], alert: AlertForDelivery) => Promise<void>;
type WebhookSender = (destination: string, alert: AlertForDelivery) => Promise<void>;

export type NotificationDeliveryOverrides = {
  db?: NotificationDeliveryDb;
  smtpConfigured?: boolean;
  sendWebhook?: WebhookSender;
  sendEmail?: AlertSender;
};

function selected(events: string[], eventType: string) {
  return events.some((event) => event === eventType && isNotificationEvent(event));
}

function deliveryDue(deliveredAt: Date | null, lastAttemptAt: Date | null, now: Date, retryAfterMs: number) {
  return !deliveredAt && (!lastAttemptAt || now.getTime() - lastAttemptAt.getTime() >= retryAfterMs);
}

/** A pure delivery plan keeps settings selection and retry behaviour independently testable. */
export function planNotificationDeliveries(input: DeliveryPlanInput): PlannedDelivery[] {
  const deliveries: PlannedDelivery[] = [];
  if (input.webhook.enabled && input.webhook.url && selected(input.webhook.events, input.alert.eventType) && deliveryDue(input.alert.webhookDeliveredAt, input.alert.webhookLastAttemptAt, input.now, input.retryAfterMs)) {
    deliveries.push({ channel: "webhook", destination: input.webhook.url });
  }
  if (input.email.enabled && input.email.smtpConfigured && input.email.recipients.length > 0 && selected(input.email.events, input.alert.eventType) && deliveryDue(input.alert.emailDeliveredAt, input.alert.emailLastAttemptAt, input.now, input.retryAfterMs)) {
    deliveries.push({ channel: "email", destination: input.email.recipients.join(", ") });
  }
  return deliveries;
}

function notificationEvents(value: unknown): NotificationEvent[] {
  return Array.isArray(value) ? value.filter((event): event is NotificationEvent => typeof event === "string" && isNotificationEvent(event)) : [];
}

function emailRecipients(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((recipient): recipient is string => typeof recipient === "string" && recipient.length > 0) : [];
}

/** Notification delivery errors are persisted and logged, so destinations never appear in them. */
export function sanitizeNotificationDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "NOTIFICATION_DELIVERY_FAILED";
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1_000);
}

async function claimChannel(db: NotificationDeliveryDb, alert: AlertForDelivery, channel: "webhook" | "email", now: Date) {
  const cutoff = new Date(now.getTime() - DELIVERY_RETRY_MS);
  const deliveredField = channel === "webhook" ? "webhookDeliveredAt" : "emailDeliveredAt";
  const attemptedField = channel === "webhook" ? "webhookLastAttemptAt" : "emailLastAttemptAt";
  const errorField = channel === "webhook" ? "webhookLastError" : "emailLastError";
  const claim = await db.notificationAlert.updateMany({
    where: {
      id: alert.id,
      status: "OPEN",
      [deliveredField]: null,
      OR: [{ [attemptedField]: null }, { [attemptedField]: { lte: cutoff } }]
    },
    data: { [attemptedField]: now, [errorField]: null }
  });
  return claim.count === 1;
}

async function sendWebhook(destination: string, alert: AlertForDelivery) {
  const response = await fetch(destination, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      event: alert.eventType,
      severity: alert.severity,
      subject: alert.subject,
      message: alert.message,
      firstObservedAt: alert.firstObservedAt.toISOString(),
      lastObservedAt: alert.lastObservedAt.toISOString()
    })
  });
  if (!response.ok) throw new Error(`WEBHOOK_DELIVERY_FAILED_${response.status}`);
}

async function sendEmail(recipients: string[], alert: AlertForDelivery) {
  const runtime = env();
  const transport = nodemailer.createTransport({
    host: runtime.SMTP_HOST,
    port: runtime.SMTP_PORT,
    secure: runtime.SMTP_SECURE,
    ...(runtime.SMTP_USER ? { auth: { user: runtime.SMTP_USER, pass: runtime.SMTP_PASSWORD } } : {})
  });
  await transport.sendMail({
    from: runtime.SMTP_FROM,
    to: recipients.join(", "),
    subject: `[BrAIker] ${alert.subject}`,
    text: `${alert.message}\n\nEvent: ${alert.eventType}\nSeverity: ${alert.severity}\nFirst observed: ${alert.firstObservedAt.toISOString()}\nLast observed: ${alert.lastObservedAt.toISOString()}`
  });
}

async function recordDeliveryResult(db: NotificationDeliveryDb, alertId: string, channel: "webhook" | "email", now: Date, error: string | null) {
  const deliveredField = channel === "webhook" ? "webhookDeliveredAt" : "emailDeliveredAt";
  const errorField = channel === "webhook" ? "webhookLastError" : "emailLastError";
  await db.notificationAlert.update({ where: { id: alertId }, data: error ? { [errorField]: error } : { [deliveredField]: now, [errorField]: null } });
}

/** Delivers each durable open alert at most once per channel, retrying failed delivery after a bounded delay. */
export async function dispatchPendingNotificationAlerts(now = new Date(), overrides: NotificationDeliveryOverrides = {}) {
  const db = overrides.db ?? prisma;
  const [settings, alerts] = await Promise.all([
    db.notificationSettings.findUnique({ where: { scope: "global" } }),
    db.notificationAlert.findMany({ where: { status: "OPEN" }, orderBy: { lastObservedAt: "asc" }, take: 100 })
  ]);
  if (!settings) return { delivered: 0, failed: 0 };
  const runtime = env();
  let webhookUrl: string | null = null;
  if (settings.webhookEnabled && settings.encryptedWebhookUrl && settings.webhookUrlIv && settings.webhookUrlTag) {
    try {
      webhookUrl = decryptSecret({ ciphertext: settings.encryptedWebhookUrl, iv: settings.webhookUrlIv, tag: settings.webhookUrlTag, keyVersion: settings.webhookKeyVersion });
    } catch (error) {
      logger.warn({ err: sanitizeNotificationDeliveryError(error) }, "Unable to decrypt notification webhook destination");
    }
  }
  const webhook = { enabled: settings.webhookEnabled, url: webhookUrl, events: notificationEvents(settings.webhookEvents) };
  const email = { enabled: settings.emailEnabled, smtpConfigured: overrides.smtpConfigured ?? Boolean(runtime.SMTP_HOST && runtime.SMTP_FROM), recipients: emailRecipients(settings.emailRecipients), events: notificationEvents(settings.emailEvents) };
  let delivered = 0;
  let failed = 0;
  for (const alert of alerts) {
    const deliveries = planNotificationDeliveries({ alert, now, retryAfterMs: DELIVERY_RETRY_MS, webhook, email });
    for (const delivery of deliveries) {
      if (!await claimChannel(db, alert, delivery.channel, now)) continue;
      try {
        if (delivery.channel === "webhook") await (overrides.sendWebhook ?? sendWebhook)(delivery.destination, alert);
        else await (overrides.sendEmail ?? sendEmail)(email.recipients, alert);
        await recordDeliveryResult(db, alert.id, delivery.channel, now, null);
        delivered += 1;
      } catch (error) {
        const message = sanitizeNotificationDeliveryError(error);
        await recordDeliveryResult(db, alert.id, delivery.channel, now, message);
        logger.warn({ alertId: alert.id, eventType: alert.eventType, channel: delivery.channel, err: message }, "Notification delivery failed");
        failed += 1;
      }
    }
  }
  return { delivered, failed };
}
