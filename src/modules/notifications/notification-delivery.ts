import nodemailer from "nodemailer";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { appendManagerAlert } from "@/modules/manager-chat/manager-chat-service";
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
  telegramDeliveredAt: Date | null;
  telegramLastAttemptAt: Date | null;
};

type WebhookSettings = { enabled: boolean; url: string | null; events: string[] };
type EmailSettings = { enabled: boolean; smtpConfigured: boolean; recipients: string[]; events: string[] };
type TelegramSettings = { enabled: boolean; configured: boolean; paired: boolean; events: string[] };
export type DeliveryPlanInput = { alert: AlertForDelivery; now: Date; retryAfterMs: number; webhook: WebhookSettings; email: EmailSettings; telegram: TelegramSettings };
export type PlannedDelivery = { channel: "webhook" | "email" | "telegram"; destination: string };
type NotificationDeliveryDb = Pick<PrismaClient, "notificationSettings" | "notificationAlert" | "telegramManagerSession" | "managerChatSession" | "managerChatMessage">;
type AlertSender = (recipients: string[], alert: AlertForDelivery) => Promise<void>;
type WebhookSender = (destination: string, alert: AlertForDelivery) => Promise<void>;
type TelegramSender = (alert: AlertForDelivery) => Promise<void>;

export type NotificationDeliveryOverrides = {
  db?: NotificationDeliveryDb;
  smtpConfigured?: boolean;
  sendWebhook?: WebhookSender;
  sendEmail?: AlertSender;
  sendTelegram?: TelegramSender;
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
  if (input.telegram.enabled && input.telegram.configured && input.telegram.paired && selected(input.telegram.events, input.alert.eventType) && deliveryDue(input.alert.telegramDeliveredAt, input.alert.telegramLastAttemptAt, input.now, input.retryAfterMs)) {
    deliveries.push({ channel: "telegram", destination: "paired-bot-manager" });
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
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[redacted-telegram-token]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1_000);
}

/** Telegram alerts are also written to the read-only Operations transcript after delivery. */
export async function recordTelegramDeliveryTranscript(input: { userId: string; alert: AlertForDelivery }, db: Pick<PrismaClient, "managerChatSession" | "managerChatMessage">) {
  return appendManagerAlert({
    userId: input.userId,
    alertId: input.alert.id,
    subject: input.alert.subject,
    message: input.alert.message
  }, db);
}

async function claimChannel(db: NotificationDeliveryDb, alert: AlertForDelivery, channel: PlannedDelivery["channel"], now: Date) {
  const cutoff = new Date(now.getTime() - DELIVERY_RETRY_MS);
  const deliveredField = `${channel}DeliveredAt` as "webhookDeliveredAt" | "emailDeliveredAt" | "telegramDeliveredAt";
  const attemptedField = `${channel}LastAttemptAt` as "webhookLastAttemptAt" | "emailLastAttemptAt" | "telegramLastAttemptAt";
  const errorField = `${channel}LastError` as "webhookLastError" | "emailLastError" | "telegramLastError";
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

async function sendTelegram(token: string, chatId: string, alert: AlertForDelivery) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ chat_id: chatId, text: `[BrAIker] ${alert.subject}\n\n${alert.message}\n\nEvent: ${alert.eventType}\nSeverity: ${alert.severity}` })
  });
  if (!response.ok) throw new Error(`TELEGRAM_DELIVERY_FAILED_${response.status}`);
}

async function recordDeliveryResult(db: NotificationDeliveryDb, alertId: string, channel: PlannedDelivery["channel"], now: Date, error: string | null) {
  const deliveredField = `${channel}DeliveredAt` as "webhookDeliveredAt" | "emailDeliveredAt" | "telegramDeliveredAt";
  const errorField = `${channel}LastError` as "webhookLastError" | "emailLastError" | "telegramLastError";
  await db.notificationAlert.update({ where: { id: alertId }, data: error ? { [errorField]: error } : { [deliveredField]: now, [errorField]: null } });
}

/** Delivers each durable open alert at most once per channel, retrying failed delivery after a bounded delay. */
export async function dispatchPendingNotificationAlerts(now = new Date(), overrides: NotificationDeliveryOverrides = {}) {
  const db = overrides.db ?? prisma;
  const [settings, alerts, telegramSession] = await Promise.all([
    db.notificationSettings.findUnique({ where: { scope: "global" } }),
    db.notificationAlert.findMany({ where: { status: "OPEN" }, orderBy: { lastObservedAt: "asc" }, take: 100 }),
    db.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { telegramChatId: true, userId: true } })
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
  const telegram = { enabled: settings.telegramEnabled, configured: Boolean(runtime.TELEGRAM_BOT_TOKEN), paired: Boolean(telegramSession), events: notificationEvents(settings.telegramEvents) };
  let delivered = 0;
  let failed = 0;
  for (const alert of alerts) {
    const deliveries = planNotificationDeliveries({ alert, now, retryAfterMs: DELIVERY_RETRY_MS, webhook, email, telegram });
    for (const delivery of deliveries) {
      if (!await claimChannel(db, alert, delivery.channel, now)) continue;
      try {
        if (delivery.channel === "webhook") await (overrides.sendWebhook ?? sendWebhook)(delivery.destination, alert);
        else if (delivery.channel === "email") await (overrides.sendEmail ?? sendEmail)(email.recipients, alert);
        else if (!telegramSession || !runtime.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_NOT_CONFIGURED_OR_PAIRED");
        else await (overrides.sendTelegram ?? ((item) => sendTelegram(runtime.TELEGRAM_BOT_TOKEN, telegramSession.telegramChatId, item)))(alert);
        await recordDeliveryResult(db, alert.id, delivery.channel, now, null);
        if (delivery.channel === "telegram" && telegramSession) {
          try {
            await recordTelegramDeliveryTranscript({ userId: telegramSession.userId, alert }, db);
          } catch (error) {
            logger.warn({ alertId: alert.id, err: sanitizeNotificationDeliveryError(error) }, "Telegram alert delivered but could not be added to Bot Manager transcript");
          }
        }
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
