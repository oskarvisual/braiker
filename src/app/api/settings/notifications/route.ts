import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { notificationEventIds, validateNotificationChannel } from "@/modules/notifications/notification-settings";

const eventSchema = z.enum(notificationEventIds);
const updateSchema = z.object({
  webhook: z.object({ enabled: z.boolean(), url: z.string().trim().max(2000).optional(), events: z.array(eventSchema).max(notificationEventIds.length) }),
  email: z.object({ enabled: z.boolean(), recipients: z.array(z.string().trim().email()).max(10), events: z.array(eventSchema).max(notificationEventIds.length) })
});

const defaults = {
  webhook: { enabled: false, configured: false, events: [] as string[] },
  email: { enabled: false, recipients: [] as string[], events: [] as string[] },
  smtpConfigured: false
};

function publicSettings(settings: { webhookEnabled: boolean; encryptedWebhookUrl: string | null; webhookEvents: unknown; emailEnabled: boolean; emailRecipients: unknown; emailEvents: unknown } | null) {
  if (!settings) return { ...defaults, smtpConfigured: Boolean(env().SMTP_HOST) };
  return {
    webhook: { enabled: settings.webhookEnabled, configured: Boolean(settings.encryptedWebhookUrl), events: Array.isArray(settings.webhookEvents) ? settings.webhookEvents : [] },
    email: { enabled: settings.emailEnabled, recipients: Array.isArray(settings.emailRecipients) ? settings.emailRecipients : [], events: Array.isArray(settings.emailEvents) ? settings.emailEvents : [] },
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
    const settings = await prisma.notificationSettings.findUnique({ where: { scope: "global" } });
    return NextResponse.json(publicSettings(settings));
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
    const existing = await prisma.notificationSettings.findUnique({ where: { scope: "global" } });
    const webhookUrl = body.data.webhook.url?.trim();
    const webhookError = validateNotificationChannel({ enabled: body.data.webhook.enabled, url: webhookUrl || (existing?.encryptedWebhookUrl ? "https://configured.local" : ""), events: body.data.webhook.events });
    const emailError = validateNotificationChannel({ enabled: body.data.email.enabled, recipients: body.data.email.recipients, events: body.data.email.events });
    if (webhookError || emailError) return NextResponse.json({ error: "Enable each alert channel only after selecting alerts and providing its destination." }, { status: 400 });
    const webhook = webhookUrl ? encryptSecret(webhookUrl) : null;
    const settings = await prisma.notificationSettings.upsert({
      where: { scope: "global" },
      create: {
        scope: "global", webhookEnabled: body.data.webhook.enabled, webhookEvents: body.data.webhook.events,
        encryptedWebhookUrl: webhook?.ciphertext, webhookUrlIv: webhook?.iv, webhookUrlTag: webhook?.tag, webhookKeyVersion: webhook?.keyVersion ?? 1,
        emailEnabled: body.data.email.enabled, emailRecipients: body.data.email.recipients, emailEvents: body.data.email.events
      },
      update: {
        webhookEnabled: body.data.webhook.enabled, webhookEvents: body.data.webhook.events,
        ...(webhook ? { encryptedWebhookUrl: webhook.ciphertext, webhookUrlIv: webhook.iv, webhookUrlTag: webhook.tag, webhookKeyVersion: webhook.keyVersion } : {}),
        emailEnabled: body.data.email.enabled, emailRecipients: body.data.email.recipients, emailEvents: body.data.email.events
      }
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "NOTIFICATION_SETTINGS_UPDATED", target: settings.id, metadata: { webhookEnabled: settings.webhookEnabled, webhookEvents: body.data.webhook.events, emailEnabled: settings.emailEnabled, emailEvents: body.data.email.events, recipients: body.data.email.recipients.length } } });
    return NextResponse.json(publicSettings(settings));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
