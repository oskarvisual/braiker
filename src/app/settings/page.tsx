import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { Settings } from "@/components/settings";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { intervalFromCron } from "@/modules/scheduler/schedule-policy";
import { listBotTemplates } from "@/modules/bots/bot-templates";
import { notificationEvents } from "@/modules/notifications/notification-settings";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const [wallets, task, notificationSettings] = await Promise.all([
    prisma.wallet.findMany({ orderBy: { createdAt: "desc" }, include: { connections: { where: { provider: "alpaca", mode: "PAPER" }, select: { id: true } } } }),
    prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } }),
    prisma.notificationSettings.findUnique({ where: { scope: "global" } })
  ]);
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><Settings initialWallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString(), alpacaConfigured: wallet.connections.length > 0 }))} initialSync={{ enabled: task?.enabled ?? true, intervalMinutes: task ? intervalFromCron(task.cronExpression) ?? 5 : 5, timezone: task?.timezone ?? "America/New_York" }} initialNotifications={{ webhook: { enabled: notificationSettings?.webhookEnabled ?? false, configured: Boolean(notificationSettings?.encryptedWebhookUrl), events: Array.isArray(notificationSettings?.webhookEvents) ? notificationSettings.webhookEvents as string[] : [] }, email: { enabled: notificationSettings?.emailEnabled ?? false, recipients: Array.isArray(notificationSettings?.emailRecipients) ? notificationSettings.emailRecipients as string[] : [], events: Array.isArray(notificationSettings?.emailEvents) ? notificationSettings.emailEvents as string[] : [] }, smtpConfigured: Boolean(process.env.SMTP_HOST) }} notificationEvents={notificationEvents} botProfiles={listBotTemplates()} /></main></>;
}
