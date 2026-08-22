import type { PrismaClient } from "@prisma/client";
import { managerUnavailableReply, sanitizeManagerMessage } from "@/modules/manager-chat/manager-chat";
import type { ManagerResponder } from "@/modules/manager-chat/manager-chat-service";

type BotChatDb = Pick<PrismaClient, "botChatSession" | "botChatMessage" | "botInstance">;

/** A bot/user pair owns exactly one private explanation transcript. */
export async function createOrLoadBotChat(userId: string, botId: string, db: Pick<PrismaClient, "botChatSession">) {
  return db.botChatSession.upsert({
    where: { botId_userId: { botId, userId } },
    create: { userId, botId },
    update: {}
  });
}

async function botContext(botId: string, db: BotChatDb) {
  const bot = await db.botInstance.findUnique({
    where: { id: botId },
    select: {
      id: true, name: true, runMode: true, lifeStatus: true, currentCapital: true, reservedCapital: true,
      watchlist: { where: { enabled: true }, select: { symbol: true } },
      dailyInputs: { orderBy: { marketDate: "desc" }, take: 1, select: { marketDate: true, content: true } },
      scanRuns: { orderBy: { startedAt: "desc" }, take: 10, select: { status: true, reason: true, message: true, startedAt: true } },
      proposals: { orderBy: { createdAt: "desc" }, take: 10, select: { symbol: true, action: true, status: true, createdAt: true, riskDecision: { select: { approved: true, reason: true } } } }
    }
  });
  if (!bot) throw new Error("BOT_NOT_FOUND");
  return {
    bot: {
      name: bot.name,
      power: bot.runMode === "PAPER_ACTIVE" ? "ON" : "OFF",
      life: bot.lifeStatus,
      currentCapital: bot.currentCapital.toString(),
      reservedCapital: bot.reservedCapital.toString(),
      symbols: bot.watchlist.map((entry) => entry.symbol),
      dailyInput: bot.dailyInputs[0] ? { marketDate: bot.dailyInputs[0].marketDate.toISOString(), content: bot.dailyInputs[0].content } : null,
      scans: bot.scanRuns.map((scan) => ({ ...scan, startedAt: scan.startedAt.toISOString() })),
      proposals: bot.proposals.map((proposal) => ({ ...proposal, createdAt: proposal.createdAt.toISOString() }))
    },
    guardrails: "This is a read-only explanation transcript. It cannot change capital, limits, instructions, Kill Switch, bot power, or create an order."
  };
}

/** Stores a question and a contextual, read-only answer for one bot only. */
export async function sendBotChatMessage(
  input: { userId: string; botId: string; content: string },
  dependencies: { db: BotChatDb; responder: ManagerResponder; aiEnabled: boolean }
) {
  const content = sanitizeManagerMessage(input.content);
  if (!content) throw new Error("BOT_CHAT_MESSAGE_EMPTY");
  const session = await createOrLoadBotChat(input.userId, input.botId, dependencies.db);
  await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "USER", content } });
  if (!dependencies.aiEnabled) {
    const reply = managerUnavailableReply("DISABLED");
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
    return { reply, available: false };
  }
  const history = await dependencies.db.botChatMessage.findMany({ where: { sessionId: session.id, role: { in: ["USER", "ASSISTANT"] } }, select: { role: true, content: true }, orderBy: { createdAt: "desc" }, take: 12 });
  try {
    const reply = await dependencies.responder.reply({
      message: content,
      history: history.reverse().map((item) => ({ role: item.role === "USER" ? "user" as const : "assistant" as const, content: item.content })),
      context: await botContext(input.botId, dependencies.db)
    });
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: sanitizeManagerMessage(reply) } });
    return { reply, available: true };
  } catch {
    const reply = managerUnavailableReply("UNAVAILABLE");
    await dependencies.db.botChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
    return { reply, available: false };
  }
}
