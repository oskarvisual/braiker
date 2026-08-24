import { Prisma, TradeAction, type PrismaClient } from "@prisma/client";
import { resolveAdaptiveRiskPolicy } from "@/modules/bots/adaptive-risk";
import { newYorkMarketDayStart } from "@/modules/market/new-york-market-day";
import type { RiskPolicy } from "@/modules/risk/types";

export type BotInformationRequest = "TRADES" | "CAPITAL" | "SUMMARY";

export type BotInformation = {
  name: string;
  tradesToday: number;
  maxTradesPerDay: number;
  currentCapital: string;
  reservedCapital: string;
  checkedAt: Date;
};

type BotInformationDb = Pick<PrismaClient, "botInstance" | "tradeProposal">;

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function parseBotInformationRequest(content: string): BotInformationRequest | null {
  const value = normalized(content);
  if (/(?:operaciones?|trades?)\b.*(?:restantes?|quedan|disponibles?|left|remaining|available)|(?:restantes?|quedan|left|remaining)\b.*(?:operaciones?|trades?)/.test(value)) return "TRADES";
  if (/(?:dinero|capital|efectivo|cash|money)\b.*(?:queda|quedan|restante|disponible|left|remaining|available)|(?:how much|cuanto|cuanta)\b.*(?:dinero|capital|efectivo|cash|money)/.test(value)) return "CAPITAL";
  if (/\b(?:estado|resumen|summary|status)\b/.test(value)) return "SUMMARY";
  return null;
}

export function exactNamedBot<T extends { id: string; name: string }>(content: string, bots: T[]) {
  const message = normalized(content);
  return [...bots]
    .sort((left, right) => right.name.length - left.name.length)
    .find((bot) => new RegExp(`(?:^|[^a-z0-9])${normalized(bot.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(message)) ?? null;
}

export async function readBotInformation(botId: string, db: BotInformationDb, now = new Date()): Promise<BotInformation | null> {
  const bot = await db.botInstance.findUnique({
    where: { id: botId },
    select: {
      id: true,
      name: true,
      riskPolicy: true,
      adaptiveRiskEnabled: true,
      initialCapital: true,
      currentCapital: true,
      reservedCapital: true,
      botPositions: { where: { quantity: { gt: 0 } }, select: { id: true } }
    }
  });
  if (!bot) return null;
  const adaptive = resolveAdaptiveRiskPolicy({
    enabled: bot.adaptiveRiskEnabled,
    basePolicy: bot.riskPolicy as unknown as RiskPolicy,
    initialCapital: bot.initialCapital.toString(),
    currentCapital: bot.currentCapital.toString(),
    reservedCapital: bot.reservedCapital.toString(),
    openPositionCount: bot.botPositions.length
  });
  const tradesToday = await db.tradeProposal.count({
    where: {
      botId,
      action: { not: TradeAction.HOLD },
      createdAt: { gte: newYorkMarketDayStart(now), lte: now }
    }
  });
  return {
    name: bot.name,
    tradesToday,
    maxTradesPerDay: adaptive.effectivePolicy.maxTradesPerDay,
    currentCapital: bot.currentCapital.toString(),
    reservedCapital: bot.reservedCapital.toString(),
    checkedAt: now
  };
}

function formatMoney(value: string) {
  return `$${new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2)}`;
}

function wantsSpanish(locale: string) {
  return locale.toLocaleLowerCase().startsWith("es");
}

/** A typed, read-only reply keeps exact operational figures out of the model. */
export function buildBotInformationReply(input: BotInformation & { locale: string }) {
  const availableCapital = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(input.currentCapital).minus(input.reservedCapital));
  const remainingTrades = Math.max(0, input.maxTradesPerDay - input.tradesToday);
  if (wantsSpanish(input.locale)) {
    return [
      `**Estado informativo · ${input.name}**`,
      `- Operaciones hoy: ${input.tradesToday}/${input.maxTradesPerDay} (límite efectivo).`,
      `- Operaciones restantes: ${remainingTrades}.`,
      `- Capital virtual: ${formatMoney(input.currentCapital)}.`,
      `- Capital reservado: ${formatMoney(input.reservedCapital)}.`,
      `- Capital disponible para nuevas compras: ${formatMoney(availableCapital.toString())}.`,
      "El capital virtual no incluye una valoración de mercado en tiempo real de posiciones abiertas."
    ].join("\n");
  }
  return [
    `**Information status · ${input.name}**`,
    `- Trades today: ${input.tradesToday}/${input.maxTradesPerDay} (effective limit).`,
    `- Trades remaining: ${remainingTrades}.`,
    `- Virtual capital: ${formatMoney(input.currentCapital)}.`,
    `- Reserved capital: ${formatMoney(input.reservedCapital)}.`,
    `- Capital available for new buys: ${formatMoney(availableCapital.toString())}.`,
    "Virtual capital does not include a real-time market valuation of open positions."
  ].join("\n");
}
