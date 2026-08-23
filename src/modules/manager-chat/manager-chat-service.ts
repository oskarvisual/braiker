import type { PrismaClient, UserRole } from "@prisma/client";
import { disableAiRuntimeForQuota, getAiRuntimeState } from "@/modules/ai/ai-runtime-state";
import { managerUnavailableReply, sanitizeManagerMessage } from "./manager-chat";
import type { ManagerChatHistoryItem, ManagerChatRequest } from "./openai-manager-chat";
import { prepareManagerPowerProposal } from "./manager-power-intents";
import { createManagerBotChatNote } from "@/modules/bot-chat/bot-chat-service";
import { createManagerMacroEvent } from "./manager-macro-event-service";
import { parseManagerLearningCommand, recordLearnedInstruction } from "@/modules/bots/learned-instruction-service";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import { managerMarketClockContext } from "./manager-market-context";

export const operationsSessionKey = (userId: string) => `operations:${userId}`;

type ManagerSessionDb = Pick<PrismaClient, "managerChatSession">;
type ManagerAlertDb = Pick<PrismaClient, "managerChatSession" | "managerChatMessage">;
type ManagerChatDb = ManagerAlertDb & Pick<PrismaClient, "aiRuntimeState" | "botInstance" | "botScanRun" | "tradeProposal" | "order" | "botPosition" | "managerActionProposal" | "botChatSession" | "botChatMessage" | "botDailyContext" | "botLearnedInstruction" | "resourceSource" | "macroCalendarEvent" | "auditLog">;

export type ManagerResponder = {
  reply(request: ManagerChatRequest): Promise<string>;
};

type SendManagerMessageInput = {
  userId: string;
  sessionId: string;
  content: string;
  source?: "WEB" | "TELEGRAM";
  sourceReference?: string;
  actorRole?: UserRole;
  requestedVia?: "WEB" | "TELEGRAM";
};

/**
 * Creates an ordinary, user-owned transcript. It is deliberately separate
 * from the pinned Operations session used by Telegram and alert delivery.
 */
export async function createManagerConversation(userId: string, title: string, db: ManagerSessionDb) {
  const normalizedTitle = sanitizeManagerMessage(title).slice(0, 120) || "New conversation";
  return db.managerChatSession.create({
    data: { userId, kind: "CONVERSATION", title: normalizedTitle, pinned: false }
  });
}

/** Returns only this user's sessions and bounded recent messages for the dashboard. */
export async function listManagerConversations(userId: string, db: ManagerSessionDb) {
  await ensureOperationsSession(userId, db);
  const sessions = await db.managerChatSession.findMany({
    where: { userId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100 } }
  });
  return sessions.map((session) => ({ ...session, messages: [...session.messages].reverse() }));
}

function decimalString(value: { toString(): string } | null | undefined) {
  return value?.toString() ?? "0";
}

/** The pinned Operations transcript is deterministic and shared by web alerts and Telegram. */
export async function ensureOperationsSession(userId: string, db: ManagerSessionDb) {
  const externalKey = operationsSessionKey(userId);
  try {
    return await db.managerChatSession.upsert({
      where: { externalKey },
      create: { userId, kind: "OPERATIONS", title: "Bot Manager · Operations", pinned: true, externalKey },
      update: { pinned: true, title: "Bot Manager · Operations" }
    });
  } catch (error) {
    // Prisma can implement an upsert as select/insert on MySQL. Two alert
    // deliveries for a new user may therefore race for this unique key.
    if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") throw error;
    const existing = await db.managerChatSession.findUnique({ where: { externalKey } });
    if (existing) return existing;
    throw error;
  }
}

/** Alert retries are deliberately collapsed by the original alert id. */
export async function appendManagerAlert(input: { userId: string; alertId: string; subject: string; message: string }, db: ManagerAlertDb) {
  const session = await ensureOperationsSession(input.userId, db);
  const content = sanitizeManagerMessage(`${input.subject}: ${input.message}`);
  return db.managerChatMessage.upsert({
    where: { sourceReference: `telegram-alert:${input.alertId}` },
    create: { sessionId: session.id, sourceReference: `telegram-alert:${input.alertId}`, role: "SYSTEM", source: "TELEGRAM_ALERT", content },
    update: {}
  });
}

async function safeOperationalContext(db: ManagerChatDb, message: string) {
  const bots = await db.botInstance.findMany({
    select: {
      id: true,
      name: true,
      runMode: true,
      lifeStatus: true,
      currentCapital: true,
      reservedCapital: true,
      updatedAt: true,
      watchlist: { where: { enabled: true }, select: { symbol: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  const botIds = bots.map((bot) => bot.id);
  const scans = botIds.length === 0 ? [] : await db.botScanRun.findMany({
    where: { botId: { in: botIds } },
    select: { botId: true, status: true, reason: true, startedAt: true, completedAt: true },
    orderBy: { startedAt: "desc" },
    take: 50
  });
  const lastScanByBot = new Map<string, (typeof scans)[number]>();
  for (const scan of scans) if (!lastScanByBot.has(scan.botId)) lastScanByBot.set(scan.botId, scan);

  const proposalCounts = botIds.length === 0 ? [] : await db.tradeProposal.groupBy({
    by: ["status"],
    where: { botId: { in: botIds } },
    _count: { _all: true }
  });

  const normalizedMessage = normalizedBotName(message);
  const namedBot = bots.find((bot) => {
    const name = normalizedBotName(bot.name);
    return new RegExp(`(?:^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(normalizedMessage);
  });
  const detailed = namedBot ? await detailedBotContext(namedBot.id, db) : null;
  let clock = null;
  try { clock = await globalPaperBroker().getClock(); } catch { /* Unknown is safer than a guessed schedule. */ }
  return {
    generatedAt: new Date().toISOString(),
    marketClock: managerMarketClockContext(clock),
    botCount: bots.length,
    proposalsByStatus: Object.fromEntries(proposalCounts.map((item) => [item.status, item._count._all])),
    bots: bots.map((bot) => {
      const scan = lastScanByBot.get(bot.id);
      return {
        name: bot.name,
        power: bot.runMode === "PAPER_ACTIVE" ? "ON" : "OFF",
        life: bot.lifeStatus,
        currentCapital: decimalString(bot.currentCapital),
        reservedCapital: decimalString(bot.reservedCapital),
        symbols: bot.watchlist.map((watch) => watch.symbol),
        lastScan: scan ? { status: scan.status, reason: scan.reason, startedAt: scan.startedAt.toISOString(), completedAt: scan.completedAt?.toISOString() ?? null } : null
      };
    }),
    namedBot: detailed
  };
}

/** A named bot gets bounded evidence, never credentials, wallets, or mutable controls. */
async function detailedBotContext(botId: string, db: ManagerChatDb) {
  const [proposals, scans, positions] = await Promise.all([
    db.tradeProposal.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, take: 20, select: { symbol: true, action: true, status: true, estimatedPrice: true, createdAt: true, riskDecision: { select: { approved: true, reason: true, createdAt: true } } } }),
    db.botScanRun.findMany({ where: { botId }, orderBy: { startedAt: "desc" }, take: 20, select: { status: true, reason: true, message: true, startedAt: true, completedAt: true } }),
    db.botPosition.findMany({ where: { botId }, orderBy: { updatedAt: "desc" }, take: 50, select: { symbol: true, quantity: true, averageEntryPrice: true, updatedAt: true } })
  ]);
  const proposalIds = await db.tradeProposal.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true } });
  const orders = proposalIds.length ? await db.order.findMany({ where: { proposalId: { in: proposalIds.map((proposal) => proposal.id) } }, orderBy: { createdAt: "desc" }, take: 20, select: { symbol: true, action: true, status: true, quantity: true, createdAt: true, fills: { select: { quantity: true, price: true, realizedPnl: true, filledAt: true }, take: 20 } } }) : [];
  return {
    botId,
    orders: orders.map((order) => ({ ...order, quantity: decimalString(order.quantity), createdAt: order.createdAt.toISOString(), fills: order.fills.map((fill) => ({ quantity: decimalString(fill.quantity), price: decimalString(fill.price), realizedPnl: decimalString(fill.realizedPnl), filledAt: fill.filledAt.toISOString() })) })),
    proposals: proposals.map((proposal) => ({ ...proposal, estimatedPrice: decimalString(proposal.estimatedPrice), createdAt: proposal.createdAt.toISOString(), riskDecision: proposal.riskDecision ? { ...proposal.riskDecision, createdAt: proposal.riskDecision.createdAt.toISOString() } : null })),
    scans: scans.map((scan) => ({ ...scan, startedAt: scan.startedAt.toISOString(), completedAt: scan.completedAt?.toISOString() ?? null })),
    positions: positions.map((position) => ({ ...position, quantity: decimalString(position.quantity), averageEntryPrice: decimalString(position.averageEntryPrice), updatedAt: position.updatedAt.toISOString() }))
  };
}

async function storeAssistantReply(sessionId: string, content: string, db: ManagerChatDb, sourceReference?: string) {
  return db.managerChatMessage.create({ data: { sessionId, ...(sourceReference ? { sourceReference } : {}), role: "ASSISTANT", source: "SYSTEM", content: sanitizeManagerMessage(content) } });
}

function normalizedBotName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

async function prepareManagerBotNote(input: { userId: string; content: string }, db: ManagerChatDb) {
  const match = /^(?:note\s+for|nota\s+para)\s+(.+?)\s*:\s*(.+)$/i.exec(input.content.trim());
  if (!match) return null;
  const reference = match[1]!.trim().replace(/^(?:the\s+)?bot\s+/i, "");
  const content = match[2]!.trim();
  const bots = await db.botInstance.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 });
  const bot = bots.find((candidate) => normalizedBotName(candidate.name) === normalizedBotName(reference));
  if (!bot) return { reply: `I could not find an exact bot named “${reference}”. No daily note was created.` };
  await createManagerBotChatNote({ userId: input.userId, botId: bot.id, content, title: "Bot Manager daily note" }, db);
  return { reply: `Created a local bot-chat session for ${bot.name} and added the note as cautious context for today only. It cannot create orders, change capital, risk, instructions, Kill Switch, or bot power.` };
}

async function prepareManagerLearnedInstruction(input: { userId: string; content: string }, db: ManagerChatDb) {
  const command = parseManagerLearningCommand(input.content);
  if (!command) return null;
  const bots = await db.botInstance.findMany({ select: { id: true, name: true, walletId: true }, orderBy: { name: "asc" }, take: 100 });
  const bot = bots.find((candidate) => normalizedBotName(candidate.name) === normalizedBotName(command.botName));
  if (!bot) return { reply: `I could not find an exact bot named “${command.botName}”. No internal rule was recorded.` };
  const result = await recordLearnedInstruction({ userId: input.userId, botId: bot.id, walletId: bot.walletId, content: command.content, source: "MANAGER_CHAT" }, db);
  return { reply: result.created ? `Recorded internal caution rule revision ${result.instruction.revision} for ${bot.name}. It remains separate from Additional instructions and can only add caution or veto an AI review.` : `That exact internal rule is already the latest revision for ${bot.name}; no duplicate was recorded.` };
}

/**
 * Stores a user message then produces a read-only response. Provider failures
 * cannot affect worker execution, risk, bot power, capital, or Kill Switches.
 */
export async function sendManagerMessage(input: SendManagerMessageInput, dependencies: { db: ManagerChatDb; responder: ManagerResponder; aiEnabled: boolean }) {
  const session = await dependencies.db.managerChatSession.findFirst({ where: { id: input.sessionId, userId: input.userId }, select: { id: true } });
  if (!session) throw new Error("MANAGER_SESSION_NOT_FOUND");

  const content = sanitizeManagerMessage(input.content);
  if (!content) throw new Error("MANAGER_MESSAGE_EMPTY");
  const replyReference = input.sourceReference ? `reply:${input.sourceReference}` : undefined;
  let currentMessageId: string | undefined;
  if (input.sourceReference) {
    const priorMessage = await dependencies.db.managerChatMessage.findUnique({ where: { sourceReference: input.sourceReference }, select: { id: true } });
    if (priorMessage) {
      currentMessageId = priorMessage.id;
      const priorReply = await dependencies.db.managerChatMessage.findUnique({ where: { sourceReference: replyReference! }, select: { content: true } });
      if (priorReply) return { reply: priorReply.content, available: true };
    }
  }
  if (!currentMessageId) {
    const message = await dependencies.db.managerChatMessage.create({
      data: { sessionId: session.id, sourceReference: input.sourceReference, role: "USER", source: input.source ?? "WEB", content }
    });
    currentMessageId = message.id;
  }

  if (input.actorRole && input.requestedVia) {
    const power = await prepareManagerPowerProposal({
      userId: input.userId,
      actorRole: input.actorRole,
      content,
      requestedVia: input.requestedVia
    }, dependencies.db);
    if (power.kind !== "none") {
      await storeAssistantReply(session.id, power.reply, dependencies.db, replyReference);
      if (power.kind === "proposal") {
        return {
          reply: power.reply,
          available: true,
          actionProposal: { id: power.id, botName: power.bot.name, action: power.action, expiresAt: power.expiresAt, confirmationCode: power.confirmationCode }
        };
      }
      return { reply: power.reply, available: true };
    }
    const note = await prepareManagerBotNote({ userId: input.userId, content }, dependencies.db);
    if (note) {
      await storeAssistantReply(session.id, note.reply, dependencies.db, replyReference);
      return { reply: note.reply, available: true };
    }
    if (input.actorRole !== "ADMIN") {
      const learning = parseManagerLearningCommand(content);
      const macro = /^(?:evento\s+macro|macro\s+event)\s*:/i.test(content);
      if (learning || macro) {
        const reply = "Only an Admin may record internal learning or create macro-calendar events.";
        await storeAssistantReply(session.id, reply, dependencies.db, replyReference);
        return { reply, available: true };
      }
    } else {
      const learning = await prepareManagerLearnedInstruction({ userId: input.userId, content }, dependencies.db);
      if (learning) {
        await storeAssistantReply(session.id, learning.reply, dependencies.db, replyReference);
        return { reply: learning.reply, available: true };
      }
      const macro = await createManagerMacroEvent({ userId: input.userId, content, source: input.source ?? "WEB", sourceReference: input.sourceReference }, dependencies.db);
      if (macro) {
        await storeAssistantReply(session.id, macro.reply, dependencies.db, replyReference);
        return { reply: macro.reply, available: true };
      }
    }
  }

  const aiState = await getAiRuntimeState(dependencies.db);
  if (!dependencies.aiEnabled) {
    const reply = managerUnavailableReply("DISABLED");
    await storeAssistantReply(session.id, reply, dependencies.db, replyReference);
    return { reply, available: false };
  }
  if (aiState.status === "QUOTA_EXHAUSTED") {
    const reply = managerUnavailableReply("QUOTA_EXHAUSTED");
    await storeAssistantReply(session.id, reply, dependencies.db, replyReference);
    return { reply, available: false };
  }

  const historyRows = await dependencies.db.managerChatMessage.findMany({
    where: { sessionId: session.id, role: { in: ["USER", "ASSISTANT"] }, ...(currentMessageId ? { id: { not: currentMessageId } } : {}) },
    select: { role: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 11
  });
  const history: ManagerChatHistoryItem[] = historyRows.reverse().map((row) => ({ role: row.role === "USER" ? "user" : "assistant", content: row.content }));

  try {
    const reply = await dependencies.responder.reply({ message: content, history, context: await safeOperationalContext(dependencies.db, content) });
    await storeAssistantReply(session.id, reply, dependencies.db, replyReference);
    return { reply, available: true };
  } catch (error) {
    const quota = error instanceof Error && error.message === "OPENAI_QUOTA_EXHAUSTED";
    if (quota) await disableAiRuntimeForQuota(new Date(), dependencies.db);
    const reply = managerUnavailableReply(quota ? "QUOTA_EXHAUSTED" : "UNAVAILABLE");
    await storeAssistantReply(session.id, reply, dependencies.db, replyReference);
    return { reply, available: false };
  }
}
