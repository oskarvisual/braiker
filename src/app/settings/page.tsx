import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { AppNavigation } from "@/components/app-navigation";
import { Settings } from "@/components/settings";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { intervalFromCron } from "@/modules/scheduler/schedule-policy";
import { listConfiguredBotTemplates } from "@/modules/bots/profile-defaults";
import { notificationEvents } from "@/modules/notifications/notification-settings";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const [wallets, paperCapital, task, notificationSettings, botProfiles] = await Promise.all([
    prisma.wallet.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.paperCapitalPool.findUnique({ where: { scope: "global" } }),
    prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } }),
    prisma.notificationSettings.findUnique({ where: { scope: "global" } }),
    listConfiguredBotTemplates()
  ]);
  const managedCapital = paperCapital?.managedCapital ?? wallets.reduce((sum, wallet) => sum.plus(wallet.managedCapital), new Prisma.Decimal(0));
  const availableCapital = paperCapital?.unallocatedCapital ?? new Prisma.Decimal(0);
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><Settings initialWallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString() }))} initialPaperCapital={{ managedCapital: managedCapital.toString(), availableCapital: availableCapital.toString(), allocatedCapital: managedCapital.minus(availableCapital).toString() }} initialSync={{ enabled: task?.enabled ?? true, intervalMinutes: task ? intervalFromCron(task.cronExpression) ?? 5 : 5, timezone: task?.timezone ?? "America/New_York" }} initialNotifications={{ webhook: { enabled: notificationSettings?.webhookEnabled ?? false, configured: Boolean(notificationSettings?.encryptedWebhookUrl), events: Array.isArray(notificationSettings?.webhookEvents) ? notificationSettings.webhookEvents as string[] : [] }, email: { enabled: notificationSettings?.emailEnabled ?? false, recipients: Array.isArray(notificationSettings?.emailRecipients) ? notificationSettings.emailRecipients as string[] : [], events: Array.isArray(notificationSettings?.emailEvents) ? notificationSettings.emailEvents as string[] : [] }, smtpConfigured: Boolean(process.env.SMTP_HOST) }} notificationEvents={notificationEvents} botProfiles={botProfiles} /></main></>;
}
