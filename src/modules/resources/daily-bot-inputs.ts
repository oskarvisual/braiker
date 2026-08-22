import type { PrismaClient } from "@prisma/client";

type BotInputDb = Pick<PrismaClient, "dailyMarketBrief" | "botInstance" | "dailyBotInput">;
type BriefForInput = { id: string; marketDate: Date; resources: Array<{ source: { category: string; hostname: string }; snapshot: { contentHash: string } }> };
type BotForInput = { id: string; name: string; templateId: string; watchlist: Array<{ symbol: string }> };

const categoryCaution: Record<string, string> = {
  MACRO: "Treat macro conditions as a reason to defer when event uncertainty is material.",
  NEWS: "Require fresh market confirmation; do not chase a news-driven move.",
  FILINGS: "Review filing context before relying on a company-specific candidate.",
  EARNINGS: "Use extra caution around earnings-sensitive symbols and defer when timing is unclear.",
  SENTIMENT: "Treat sentiment as cautionary context, never as a trade trigger.",
  ETF_ROTATION: "Check broad ETF context before accepting a sector-dependent candidate.",
  TECHNICAL: "Keep the deterministic technical strategy authoritative; this context cannot override it."
};

function personalityCaution(templateId: string) {
  if (templateId === "GUARDIAN") return "Guardian posture: favor deferral whenever the cited context is incomplete or conflicted.";
  if (templateId === "EXPLORER") return "Explorer posture: explore only within existing limits; uncertainty still requires caution or deferral.";
  return "Navigator posture: require alignment between deterministic evidence and the cited daily context.";
}

/** Produces structured, audit-friendly context without passing source prose as instructions. */
export function buildDailyBotInput(input: { bot: BotForInput; brief: BriefForInput }) {
  const categories = [...new Set(input.brief.resources.map((resource) => resource.source.category))];
  return {
    marketDate: input.brief.marketDate.toISOString(),
    bot: { name: input.bot.name, template: input.bot.templateId, symbols: input.bot.watchlist.map((entry) => entry.symbol) },
    executionPolicy: "This daily input may block or defer a candidate. It must never create a signal, increase size, relax a limit, override risk, or submit an order.",
    recommendations: [personalityCaution(input.bot.templateId), ...categories.map((category) => categoryCaution[category] ?? "Treat uncategorized context as caution only.")],
    citations: input.brief.resources.map((resource) => ({ category: resource.source.category, hostname: resource.source.hostname, hash: resource.snapshot.contentHash }))
  };
}

/** Idempotently distributes one immutable, conservative input to each living bot. */
export async function publishDailyBotInputs(briefId: string, db: BotInputDb) {
  const brief = await db.dailyMarketBrief.findUniqueOrThrow({
    where: { id: briefId },
    include: { resources: { include: { source: { select: { category: true, hostname: true } }, snapshot: { select: { contentHash: true } } } } }
  }) as BriefForInput;
  const bots = await db.botInstance.findMany({
    where: { lifeStatus: "ACTIVE" },
    select: { id: true, name: true, templateId: true, watchlist: { where: { enabled: true }, select: { symbol: true } } }
  }) as BotForInput[];
  await Promise.all(bots.map((bot) => db.dailyBotInput.upsert({
    where: { botId_marketDate: { botId: bot.id, marketDate: brief.marketDate } },
    create: { botId: bot.id, dailyMarketBriefId: brief.id, marketDate: brief.marketDate, content: buildDailyBotInput({ bot, brief }) },
    // The briefing is immutable. A retry may only repair a missing row, never
    // rewrite the input already observed by a bot.
    update: {}
  })));
  return { inputs: bots.length, marketDate: brief.marketDate };
}
