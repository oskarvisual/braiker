import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageWallet } from "@/modules/auth/authorization";
import { listBotTemplates } from "@/modules/bots/bot-templates";
import { currentUser } from "@/modules/auth/session";
import { BotSetup } from "@/components/bot-setup";
import { AppNavigation } from "@/components/app-navigation";

export default async function SetupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageWallet(user.role)) redirect("/");
  const wallets = await prisma.wallet.findMany({
    orderBy: { createdAt: "desc" },
    include: { bots: { orderBy: { createdAt: "asc" }, include: { watchlist: { where: { enabled: true }, orderBy: { symbol: "asc" } } } } }
  });
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><BotSetup initialWallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString(), bots: wallet.bots.map((bot) => { const profile = bot.strategyProfile as { customInstructions?: string }; const riskPolicy = bot.riskPolicy as { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number }; return { id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, runMode: bot.runMode, status: bot.status, lifeStatus: bot.lifeStatus, initialCapital: bot.initialCapital.toString(), currentCapital: bot.currentCapital.toString(), killSwitch: bot.killSwitch, customInstructions: profile.customInstructions ?? "", riskPolicy, symbols: bot.watchlist.map((item) => item.symbol) }; }) }))} templates={listBotTemplates()} /></main></>;
}
