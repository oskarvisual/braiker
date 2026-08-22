import type { PrismaClient } from "@prisma/client";
import { disableAiRuntimeForQuota, getAiRuntimeState } from "@/modules/ai/ai-runtime-state";
import { managerUnavailableReply, sanitizeManagerMessage } from "./manager-chat";
import type { ManagerChatHistoryItem, ManagerChatRequest } from "./openai-manager-chat";

export const operationsSessionKey = (userId: string) => `operations:${userId}`;

type ManagerSessionDb = Pick<PrismaClient, "managerChatSession">;
type ManagerAlertDb = Pick<PrismaClient, "managerChatSession" | "managerChatMessage">;
type ManagerChatDb = ManagerAlertDb & Pick<PrismaClient, "aiRuntimeState" | "botInstance" | "botScanRun" | "tradeProposal">;

export type ManagerResponder = {
  reply(request: ManagerChatRequest): Promise<string>;
};

type SendManagerMessageInput = {
  userId: string;
  sessionId: string;
  content: string;
  source?: "WEB" | "TELEGRAM";
  sourceReference?: string;
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
  return db.managerChatSession.findMany({
    where: { userId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } }
  });
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

async function safeOperationalContext(db: ManagerChatDb) {
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

  return {
    generatedAt: new Date().toISOString(),
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
    })
  };
}

async function storeAssistantReply(sessionId: string, content: string, db: ManagerChatDb, sourceReference?: string) {
  return db.managerChatMessage.create({ data: { sessionId, ...(sourceReference ? { sourceReference } : {}), role: "ASSISTANT", source: "SYSTEM", content: sanitizeManagerMessage(content) } });
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
  let priorUserMessage = false;
  if (input.sourceReference) {
    const priorMessage = await dependencies.db.managerChatMessage.findUnique({ where: { sourceReference: input.sourceReference }, select: { id: true } });
    if (priorMessage) {
      priorUserMessage = true;
      const priorReply = await dependencies.db.managerChatMessage.findUnique({ where: { sourceReference: replyReference! }, select: { content: true } });
      if (priorReply) return { reply: priorReply.content, available: true };
    }
  }
  if (!priorUserMessage) {
    await dependencies.db.managerChatMessage.create({
      data: { sessionId: session.id, sourceReference: input.sourceReference, role: "USER", source: input.source ?? "WEB", content }
    });
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
    where: { sessionId: session.id, role: { in: ["USER", "ASSISTANT"] } },
    select: { role: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 12
  });
  const history: ManagerChatHistoryItem[] = historyRows.reverse().map((row) => ({ role: row.role === "USER" ? "user" : "assistant", content: row.content }));

  try {
    const reply = await dependencies.responder.reply({ message: content, history, context: await safeOperationalContext(dependencies.db) });
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
