import type { PrismaClient } from "@prisma/client";
import { managerUnavailableReply, sanitizeManagerMessage } from "@/modules/manager-chat/manager-chat";
import type { ManagerResponder } from "@/modules/manager-chat/manager-chat-service";
import { newYorkMarketDate } from "@/modules/resources/daily-market-brief";
import { isBotChatAvailable } from "@/modules/bot-chat/availability";

type BotChatDb = Pick<PrismaClient, "botChatSession" | "botChatMessage" | "botDailyContext" | "botInstance" | "order" | "tradeProposal" | "botScanRun">;

export type BotChatFocus = { kind: "ORDER"; id: string } | { kind: "SCAN"; id: string };

function sessionTitle(value: string) {
  return sanitizeManagerMessage(value).slice(0, 120) || "New conversation";
}

/** Separate web-only sessions preserve a useful audit trail for each bot. */
export async function createBotChatSession(input: { userId: string; botId: string; title?: string }, db: Pick<PrismaClient, "botChatSession" | "botInstance">) {
  await assertBotCanChat(input.botId, db);
  return db.botChatSession.create({ data: { userId: input.userId, botId: input.botId, kind: "CONVERSATION", title: sessionTitle(input.title ?? "") } });
}

async function assertBotCanChat(botId: string, db: Pick<PrismaClient, "botInstance">) {
  const bot = await db.botInstance.findUnique({ where: { id: botId }, select: { id: true, runMode: true, lifeStatus: true, status: true, killSwitch: true } });
  if (!bot) throw new Error("BOT_NOT_FOUND");
  if (!isBotChatAvailable(bot)) throw new Error("BOT_CHAT_REQUIRES_ACTIVE_BOT");
  return bot;
}

/** Manager notes create a visible local session, never a Telegram transcript. */
export async function createManagerBotChatNote(input: { userId: string; botId: string; content: string; title?: string; now?: Date }, db: BotChatDb) {
  const content = sanitizeManagerMessage(input.content);
  if (!content) throw new Error("BOT_CHAT_MESSAGE_EMPTY");
  await assertBotCanChat(input.botId, db);
  const session = await db.botChatSession.create({ data: { userId: input.userId, botId: input.botId, kind: "MANAGER_NOTE", title: sessionTitle(input.title ?? "Bot Manager daily note") } });
  const message = await db.botChatMessage.create({ data: { sessionId: session.id, role: "SYSTEM", content: `Bot Manager note: ${content}` } });
  await db.botDailyContext.create({ data: { botId: input.botId, userId: input.userId, messageId: message.id, marketDate: newYorkMarketDate(input.now ?? new Date()), source: "MANAGER_NOTE", content } });
  return session;
}

function importantDayContext(content: string) {
  const match = /^(?:important|importante|para\s+hoy|today(?:'s)?\s+context)\s*[:\-–]\s*(.+)$/i.exec(content.trim());
  return match ? sanitizeManagerMessage(match[1]!).slice(0, 1_200) : "";
}

async function selectedFocus(botId: string, focus: BotChatFocus | undefined, db: BotChatDb) {
  if (!focus) return null;
  if (focus.kind === "SCAN") {
    const scan = await db.botScanRun.findFirst({ where: { id: focus.id, botId }, select: { id: true, status: true, reason: true, message: true, outcomes: true, startedAt: true, completedAt: true } });
    return scan ? { type: "activity", activityId: scan.id, status: scan.status, reason: scan.reason, message: scan.message, outcomes: scan.outcomes, startedAt: scan.startedAt.toISOString(), completedAt: scan.completedAt?.toISOString() ?? null } : null;
  }
  const order = await db.order.findUnique({ where: { id: focus.id }, select: { id: true, proposalId: true, symbol: true, action: true, orderType: true, quantity: true, status: true, createdAt: true, fills: { select: { quantity: true, price: true, realizedPnl: true, filledAt: true } } } });
  if (!order) return null;
  const proposal = await db.tradeProposal.findUnique({ where: { id: order.proposalId }, select: { botId: true, status: true, estimatedPrice: true, riskDecision: { select: { approved: true, reason: true, checks: true } } } });
  if (!proposal || proposal.botId !== botId) return null;
  return {
    type: "operation", orderId: order.id, symbol: order.symbol, action: order.action, orderType: order.orderType, quantity: order.quantity.toString(), status: order.status,
    createdAt: order.createdAt.toISOString(), proposalStatus: proposal.status, estimatedPrice: proposal.estimatedPrice.toString(), riskApproved: proposal.riskDecision?.approved ?? null,
    riskReason: proposal.riskDecision?.reason ?? null, riskChecks: proposal.riskDecision?.checks ?? null,
    fills: order.fills.map((fill) => ({ quantity: fill.quantity.toString(), price: fill.price.toString(), realizedPnl: fill.realizedPnl.toString(), filledAt: fill.filledAt.toISOString() }))
  };
}

async function botContext(botId: string, db: BotChatDb, focus?: BotChatFocus) {
  const bot = await db.botInstance.findUnique({
    where: { id: botId },
    select: {
      id: true, name: true, runMode: true, lifeStatus: true, currentCapital: true, reservedCapital: true,
      watchlist: { where: { enabled: true }, select: { symbol: true } },
      dailyInputs: { orderBy: { marketDate: "desc" }, take: 1, select: { marketDate: true, content: true } },
      dailyContexts: { where: { marketDate: newYorkMarketDate(new Date()) }, orderBy: { createdAt: "asc" }, take: 20, select: { source: true, content: true, createdAt: true } },
      scanRuns: { orderBy: { startedAt: "desc" }, take: 10, select: { status: true, reason: true, message: true, startedAt: true } },
      proposals: { orderBy: { createdAt: "desc" }, take: 10, select: { symbol: true, action: true, status: true, createdAt: true, riskDecision: { select: { approved: true, reason: true } } } }
    }
  });
  if (!bot) throw new Error("BOT_NOT_FOUND");
  return {
    bot: {
      name: bot.name, power: bot.runMode === "PAPER_ACTIVE" ? "ON" : "OFF", life: bot.lifeStatus,
      currentCapital: bot.currentCapital.toString(), reservedCapital: bot.reservedCapital.toString(), symbols: bot.watchlist.map((entry) => entry.symbol),
      dailyInput: bot.dailyInputs[0] ? { marketDate: bot.dailyInputs[0].marketDate.toISOString(), content: bot.dailyInputs[0].content } : null,
      dailyContext: bot.dailyContexts.map((item) => ({ source: item.source, content: item.content, createdAt: item.createdAt.toISOString() })),
      scans: bot.scanRuns.map((scan) => ({ ...scan, startedAt: scan.startedAt.toISOString() })),
      proposals: bot.proposals.map((proposal) => ({ ...proposal, createdAt: proposal.createdAt.toISOString() }))
    },
    focus: await selectedFocus(botId, focus, db),
    guardrails: "This local chat can add only day-scoped caution or a deferral. It cannot change capital, limits, permanent instructions, Kill Switch, bot power, or create an order."
  };
}

/** Stores one selected-session question and its contextual, no-authority answer. */
export async function sendBotChatMessage(input: { userId: string; botId: string; sessionId: string; content: string; focus?: BotChatFocus }, dependencies: { db: BotChatDb; responder: ManagerResponder; aiEnabled: boolean }) {
  const content = sanitizeManagerMessage(input.content);
  if (!content) throw new Error("BOT_CHAT_MESSAGE_EMPTY");
  await assertBotCanChat(input.botId, dependencies.db);
  const session = await dependencies.db.botChatSession.findFirst({ where: { id: input.sessionId, userId: input.userId, botId: input.botId }, select: { id: true } });
  if (!session) throw new Error("BOT_CHAT_SESSION_NOT_FOUND");
  const message = await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "USER", content } });
  const dailyContent = importantDayContext(content);
  if (dailyContent) await dependencies.db.botDailyContext.create({ data: { botId: input.botId, userId: input.userId, messageId: message.id, marketDate: newYorkMarketDate(new Date()), source: "USER_CHAT", content: dailyContent } });
  if (!dependencies.aiEnabled) {
    const reply = managerUnavailableReply("DISABLED");
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
    return { reply, available: false, addedToDailyContext: Boolean(dailyContent) };
  }
  const history = await dependencies.db.botChatMessage.findMany({ where: { sessionId: session.id, role: { in: ["USER", "ASSISTANT"] }, id: { not: message.id } }, select: { role: true, content: true }, orderBy: { createdAt: "desc" }, take: 11 });
  try {
    const reply = sanitizeManagerMessage(await dependencies.responder.reply({ message: content, history: history.reverse().map((item) => ({ role: item.role === "USER" ? "user" as const : "assistant" as const, content: item.content })), context: await botContext(input.botId, dependencies.db, input.focus) }));
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
    return { reply, available: true, addedToDailyContext: Boolean(dailyContent) };
  } catch {
    const reply = managerUnavailableReply("UNAVAILABLE");
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
    return { reply, available: false, addedToDailyContext: Boolean(dailyContent) };
  }
}
