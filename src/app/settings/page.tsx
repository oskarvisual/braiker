import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { AppNavigation } from "@/components/app-navigation";
import { Settings } from "@/components/settings";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { currentUser } from "@/modules/auth/session";
import { intervalFromCron } from "@/modules/scheduler/schedule-policy";
import { listConfiguredBotTemplates } from "@/modules/bots/profile-defaults";
import { notificationEvents } from "@/modules/notifications/notification-settings";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const [wallets, paperCapital, task, notificationSettings, telegramSession, botProfiles, macroEvents] = await Promise.all([
    prisma.wallet.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.paperCapitalPool.findUnique({ where: { scope: "global" } }),
    prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } }),
    prisma.notificationSettings.findUnique({ where: { scope: "global" } }),
    prisma.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { scope: true } }),
    listConfiguredBotTemplates(),
    prisma.macroCalendarEvent.findMany({ where: { startsAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }, orderBy: { startsAt: "asc" }, take: 100 })
  ]);
  const managedCapital = paperCapital?.managedCapital ?? wallets.reduce((sum, wallet) => sum.plus(wallet.managedCapital), new Prisma.Decimal(0));
  const availableCapital = paperCapital?.unallocatedCapital ?? new Prisma.Decimal(0);
  const runtime = env();
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><Settings initialWallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString() }))} initialPaperCapital={{ managedCapital: managedCapital.toString(), availableCapital: availableCapital.toString(), allocatedCapital: managedCapital.minus(availableCapital).toString() }} initialSync={{ enabled: task?.enabled ?? true, intervalMinutes: task ? intervalFromCron(task.cronExpression) ?? 5 : 5, timezone: task?.timezone ?? "America/New_York" }} initialNotifications={{ webhook: { enabled: notificationSettings?.webhookEnabled ?? false, configured: Boolean(notificationSettings?.encryptedWebhookUrl), events: Array.isArray(notificationSettings?.webhookEvents) ? notificationSettings.webhookEvents as string[] : [] }, email: { enabled: notificationSettings?.emailEnabled ?? false, recipients: Array.isArray(notificationSettings?.emailRecipients) ? notificationSettings.emailRecipients as string[] : [], events: Array.isArray(notificationSettings?.emailEvents) ? notificationSettings.emailEvents as string[] : [] }, telegram: { managerEnabled: notificationSettings?.telegramManagerEnabled ?? false, enabled: notificationSettings?.telegramEnabled ?? false, configured: Boolean(runtime.TELEGRAM_BOT_TOKEN), paired: Boolean(telegramSession), receiveMessages: notificationSettings?.telegramReceiveMessages ?? false, events: Array.isArray(notificationSettings?.telegramEvents) ? notificationSettings.telegramEvents as string[] : [] }, smtpConfigured: Boolean(runtime.SMTP_HOST) }} notificationEvents={notificationEvents} botProfiles={botProfiles} initialMacroEvents={macroEvents.map((event) => ({ id: event.id, provider: event.provider, title: event.title, impact: event.impact, startsAt: event.startsAt.toISOString(), sourceUrl: event.sourceUrl }))} /></main></>;
}
