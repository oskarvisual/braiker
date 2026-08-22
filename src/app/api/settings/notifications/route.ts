import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import {
  notificationEventIds,
  validateEmailNotificationChannel,
  validateTelegramMessageAccess,
  validateTelegramNotificationChannel,
  validateWebhookNotificationChannel,
} from "@/modules/notifications/notification-settings";

const eventSchema = z.enum(notificationEventIds);
const updateSchema = z.object({
  webhook: z.object({ enabled: z.boolean(), url: z.string().trim().max(2000).optional(), events: z.array(eventSchema).max(notificationEventIds.length) }),
  email: z.object({ enabled: z.boolean(), recipients: z.array(z.string().trim().email()).max(10), events: z.array(eventSchema).max(notificationEventIds.length) }),
  telegram: z.object({ enabled: z.boolean(), receiveMessages: z.boolean(), events: z.array(eventSchema).max(notificationEventIds.length) })
});

const defaults = {
  webhook: { enabled: false, configured: false, events: [] as string[] },
  email: { enabled: false, recipients: [] as string[], events: [] as string[] },
  telegram: { enabled: false, configured: false, paired: false, receiveMessages: false, events: [] as string[] },
  smtpConfigured: false
};

function publicSettings(settings: { webhookEnabled: boolean; encryptedWebhookUrl: string | null; webhookEvents: unknown; emailEnabled: boolean; emailRecipients: unknown; emailEvents: unknown; telegramEnabled: boolean; telegramEvents: unknown; telegramReceiveMessages: boolean } | null, paired = false) {
  if (!settings) return { ...defaults, telegram: { ...defaults.telegram, configured: Boolean(env().TELEGRAM_BOT_TOKEN), paired }, smtpConfigured: Boolean(env().SMTP_HOST) };
  return {
    webhook: { enabled: settings.webhookEnabled, configured: Boolean(settings.encryptedWebhookUrl), events: Array.isArray(settings.webhookEvents) ? settings.webhookEvents : [] },
    email: { enabled: settings.emailEnabled, recipients: Array.isArray(settings.emailRecipients) ? settings.emailRecipients : [], events: Array.isArray(settings.emailEvents) ? settings.emailEvents : [] },
    telegram: { enabled: settings.telegramEnabled, configured: Boolean(env().TELEGRAM_BOT_TOKEN), paired, receiveMessages: settings.telegramReceiveMessages, events: Array.isArray(settings.telegramEvents) ? settings.telegramEvents : [] },
    smtpConfigured: Boolean(env().SMTP_HOST)
  };
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
    const [settings, session] = await Promise.all([
      prisma.notificationSettings.findUnique({ where: { scope: "global" } }),
      prisma.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { scope: true } })
    ]);
    return NextResponse.json(publicSettings(settings, Boolean(session)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid notification settings" }, { status: 400 });
    const [existing, session] = await Promise.all([
      prisma.notificationSettings.findUnique({ where: { scope: "global" } }),
      prisma.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { scope: true } })
    ]);
    const webhookUrl = body.data.webhook.url?.trim();
    const webhookError = body.data.webhook.enabled
      ? validateWebhookNotificationChannel({ url: webhookUrl || (existing?.encryptedWebhookUrl ? "https://configured.local" : ""), enabled: true, events: body.data.webhook.events })
      : null;
    const emailError = body.data.email.enabled
      ? validateEmailNotificationChannel({ enabled: true, recipients: body.data.email.recipients, events: body.data.email.events })
      : null;
    const telegramError = validateTelegramNotificationChannel({ enabled: body.data.telegram.enabled, configured: Boolean(env().TELEGRAM_BOT_TOKEN), paired: Boolean(session), events: body.data.telegram.events });
    const telegramMessagesError = validateTelegramMessageAccess({ receiveMessages: body.data.telegram.receiveMessages, configured: Boolean(env().TELEGRAM_BOT_TOKEN), paired: Boolean(session) });
    if (webhookError || emailError || telegramError || telegramMessagesError) return NextResponse.json({ error: webhookError ?? emailError ?? telegramError ?? telegramMessagesError }, { status: 400 });
    const webhook = webhookUrl ? encryptSecret(webhookUrl) : null;
    const settings = await prisma.notificationSettings.upsert({
      where: { scope: "global" },
      create: {
        scope: "global", webhookEnabled: body.data.webhook.enabled, webhookEvents: body.data.webhook.events,
        encryptedWebhookUrl: webhook?.ciphertext, webhookUrlIv: webhook?.iv, webhookUrlTag: webhook?.tag, webhookKeyVersion: webhook?.keyVersion ?? 1,
        emailEnabled: body.data.email.enabled, emailRecipients: body.data.email.recipients, emailEvents: body.data.email.events,
        telegramEnabled: body.data.telegram.enabled, telegramEvents: body.data.telegram.events, telegramReceiveMessages: body.data.telegram.receiveMessages
      },
      update: {
        webhookEnabled: body.data.webhook.enabled, webhookEvents: body.data.webhook.events,
        ...(webhook ? { encryptedWebhookUrl: webhook.ciphertext, webhookUrlIv: webhook.iv, webhookUrlTag: webhook.tag, webhookKeyVersion: webhook.keyVersion } : {}),
        emailEnabled: body.data.email.enabled, emailRecipients: body.data.email.recipients, emailEvents: body.data.email.events,
        telegramEnabled: body.data.telegram.enabled, telegramEvents: body.data.telegram.events, telegramReceiveMessages: body.data.telegram.receiveMessages
      }
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "NOTIFICATION_SETTINGS_UPDATED", target: settings.id, metadata: { webhookEnabled: settings.webhookEnabled, webhookEvents: body.data.webhook.events, emailEnabled: settings.emailEnabled, emailEvents: body.data.email.events, recipients: body.data.email.recipients.length, telegramEnabled: settings.telegramEnabled, telegramEvents: body.data.telegram.events, telegramReceiveMessages: settings.telegramReceiveMessages } } });
    return NextResponse.json(publicSettings(settings, Boolean(session)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const safeError = message === "FORBIDDEN" || message === "UNAUTHENTICATED" ? message : "NOTIFICATION_SETTINGS_UPDATE_FAILED";
    return NextResponse.json({ error: safeError }, { status: safeError === "FORBIDDEN" ? 403 : safeError === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
