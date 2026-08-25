import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageWallet } from "@/modules/auth/authorization";
import { listConfiguredBotTemplates } from "@/modules/bots/profile-defaults";
import { currentUser } from "@/modules/auth/session";
import { BotSetup } from "@/components/bot-setup";
import { AppNavigation } from "@/components/app-navigation";
import { GLOBAL_PAPER_WALLET_ID } from "@/modules/broker/global-paper";
import { valueBotAssets } from "@/modules/bots/bot-asset-valuation";

export default async function SetupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageWallet(user.role)) redirect("/");
  const [wallets, templates, assets, globalPositions] = await Promise.all([prisma.wallet.findMany({
    orderBy: { createdAt: "desc" },
    include: { bots: { orderBy: { createdAt: "asc" }, include: { watchlist: { where: { enabled: true }, orderBy: { symbol: "asc" } }, botPositions: { where: { quantity: { gt: 0 } }, select: { id: true, symbol: true, quantity: true, averageEntryPrice: true } }, scanRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { startedAt: true, status: true, message: true } } } } }
  }), listConfiguredBotTemplates(), prisma.tradableAsset.findMany({ where: { enabled: true, active: true, tradable: true }, select: { symbol: true }, orderBy: { symbol: "asc" } }), prisma.position.findMany({ where: { walletId: GLOBAL_PAPER_WALLET_ID }, select: { symbol: true, quantity: true, marketValue: true, updatedAt: true } })]);
  const allPositions = wallets.flatMap((wallet) => wallet.bots.flatMap((bot) => bot.botPositions.map((position) => ({ botId: bot.id, symbol: position.symbol, quantity: position.quantity.toString(), averageEntryPrice: position.averageEntryPrice.toString() }))));
  const assetValues = valueBotAssets({ positions: allPositions, globalPositions: globalPositions.map((position) => ({ symbol: position.symbol, quantity: position.quantity.toString(), marketValue: position.marketValue.toString(), updatedAt: position.updatedAt.toISOString() })) }).byBot;
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><BotSetup initialWallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString(), bots: wallet.bots.map((bot) => { const profile = bot.strategyProfile as { customInstructions?: string }; const riskPolicy = bot.riskPolicy as { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number }; const latestScan = bot.scanRuns[0]; return { id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, runMode: bot.runMode, status: bot.status, lifeStatus: bot.lifeStatus, initialCapital: bot.initialCapital.toString(), currentCapital: bot.currentCapital.toString(), reservedCapital: bot.reservedCapital.toString(), openPositionCount: bot.botPositions.length, killSwitch: bot.killSwitch, adaptiveRiskEnabled: bot.adaptiveRiskEnabled, customInstructions: profile.customInstructions ?? "", riskPolicy, symbols: bot.watchlist.map((item) => item.symbol), assets: assetValues[bot.id] ?? { value: "0", valuedAt: null, unpricedSymbols: [] }, lastAnalysis: latestScan ? { startedAt: latestScan.startedAt.toISOString(), status: latestScan.status, message: latestScan.message } : null }; }) }))} templates={templates} symbols={assets.map((asset) => asset.symbol)} /></main></>;
}
