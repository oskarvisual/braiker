import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { recordLearnedInstruction } from "./learned-instruction-service";
import { lossLearningCandidate } from "./learning-proposal-policy";

const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60_000;

function telegramCanReceiveLearningProposal(settings: { telegramManagerEnabled: boolean; telegramEnabled: boolean; telegramReceiveMessages: boolean; telegramEvents: unknown } | null, session: unknown) {
  return Boolean(settings?.telegramManagerEnabled && settings.telegramEnabled && settings.telegramReceiveMessages && session && Array.isArray(settings.telegramEvents) && settings.telegramEvents.includes("LEARNING_PROPOSAL"));
}

/** Called only after a persisted SELL fill. It detects repeated losses and asks an Admin; it never writes a learned rule. */
export async function proposeLearningFromLoss(input: { botId: string; botName: string; walletId: string; symbol: string; now?: Date }, tx: Prisma.TransactionClient) {
  const now = input.now ?? new Date();
  const fills = await tx.fill.findMany({
    where: { botId: input.botId, realizedPnl: { lt: 0 }, filledAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000), lte: now }, order: { action: "SELL", symbol: input.symbol } },
    select: { id: true, realizedPnl: true, filledAt: true, order: { select: { symbol: true } } }, orderBy: { filledAt: "desc" }, take: 20
  });
  const candidate = lossLearningCandidate({ botId: input.botId, symbol: input.symbol, now, fills: fills.map((fill) => ({ id: fill.id, symbol: fill.order.symbol, realizedPnl: fill.realizedPnl.toString(), filledAt: fill.filledAt })) });
  if (!candidate) return null;
  let proposal;
  try {
    proposal = await tx.botLearningProposal.create({ data: { botId: input.botId, dedupeKey: candidate.dedupeKey, rule: candidate.rule, evidence: { kind: "REPEATED_REALIZED_LOSS", symbol: input.symbol, fillIds: candidate.evidenceFillIds }, delivery: "PENDING", expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
  const [settings, paired] = await Promise.all([
    tx.notificationSettings.findUnique({ where: { scope: "global" }, select: { telegramManagerEnabled: true, telegramEnabled: true, telegramReceiveMessages: true, telegramEvents: true } }),
    tx.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { userId: true } })
  ]);
  const message = `${input.botName} proposes an internal caution rule: ${candidate.rule} Evidence: ${candidate.evidenceFillIds.length} recent realized loss-making SELL fills in ${input.symbol}. Reply APPROVE ${proposal.id} or REJECT ${proposal.id} before ${proposal.expiresAt.toISOString()}.`;
  const telegram = telegramCanReceiveLearningProposal(settings, paired);
  if (telegram) {
    await tx.notificationAlert.create({ data: { dedupeKey: `learning-proposal:${proposal.id}`, eventType: "LEARNING_PROPOSAL", severity: "WARNING", subject: `${input.botName} requests learning approval`, message, metadata: { proposalId: proposal.id, botId: input.botId, symbol: input.symbol }, status: "OPEN", firstObservedAt: now, lastObservedAt: now } });
    await tx.botLearningProposal.update({ where: { id: proposal.id }, data: { delivery: "TELEGRAM" } });
  } else {
    const admins = await tx.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } });
    for (const admin of admins) {
      const session = await tx.managerChatSession.upsert({ where: { externalKey: `learning:${input.botId}:${admin.id}` }, create: { userId: admin.id, kind: "CONVERSATION", title: `Learning · ${input.botName}`, externalKey: `learning:${input.botId}:${admin.id}` }, update: { title: `Learning · ${input.botName}` } });
      await tx.managerChatMessage.upsert({ where: { sourceReference: `learning-proposal:${proposal.id}:${admin.id}` }, create: { sessionId: session.id, sourceReference: `learning-proposal:${proposal.id}:${admin.id}`, role: "SYSTEM", source: "SYSTEM", content: message }, update: {} });
    }
    await tx.botLearningProposal.update({ where: { id: proposal.id }, data: { delivery: "WEB_CHAT" } });
  }
  await tx.auditLog.create({ data: { walletId: input.walletId, action: "BOT_LEARNING_PROPOSAL_CREATED", target: proposal.id, metadata: { botId: input.botId, symbol: input.symbol, evidenceFillIds: candidate.evidenceFillIds, delivery: telegram ? "TELEGRAM" : "WEB_CHAT" } } });
  return proposal;
}

export async function listPendingLearningProposals(db: Pick<PrismaClient, "botLearningProposal">, now = new Date()) {
  return db.botLearningProposal.findMany({ where: { status: "PENDING", expiresAt: { gt: now } }, select: { id: true, rule: true, expiresAt: true, delivery: true, bot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
}

export async function resolveLearningProposal(input: { proposalId: string; userId: string; actorRole: UserRole; action: "APPROVE" | "REJECT"; now?: Date }, db: Pick<PrismaClient, "botLearningProposal" | "botLearnedInstruction" | "auditLog">) {
  if (input.actorRole !== "ADMIN") throw new Error("FORBIDDEN");
  const now = input.now ?? new Date();
  const claimed = await db.botLearningProposal.updateMany({ where: { id: input.proposalId, status: "PENDING", expiresAt: { gt: now } }, data: { status: input.action === "APPROVE" ? "RESOLVING" : "REJECTED", resolvedById: input.userId, resolvedAt: now } });
  if (claimed.count !== 1) throw new Error("LEARNING_PROPOSAL_NOT_PENDING");
  const proposal = await db.botLearningProposal.findUnique({ where: { id: input.proposalId }, select: { id: true, botId: true, rule: true, bot: { select: { walletId: true, name: true } } } });
  if (!proposal) throw new Error("LEARNING_PROPOSAL_NOT_PENDING");
  if (input.action === "APPROVE") {
    await recordLearnedInstruction({ userId: input.userId, botId: proposal.botId, walletId: proposal.bot.walletId, content: proposal.rule, source: "LEARNING_PROPOSAL" }, db);
    await db.botLearningProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED" } });
  }
  await db.auditLog.create({ data: { userId: input.userId, walletId: proposal.bot.walletId, action: `BOT_LEARNING_PROPOSAL_${input.action}D`, target: proposal.id, metadata: { botId: proposal.botId } } });
  return { botName: proposal.bot.name, status: input.action === "APPROVE" ? "APPROVED" : "REJECTED" };
}

export function parseLearningProposalResolution(content: string) {
  const match = /^(APPROVE|REJECT)\s+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*$/i.exec(content.trim());
  return match ? { action: match[1]!.toUpperCase() as "APPROVE" | "REJECT", proposalId: match[2]!.toLowerCase() } : null;
}
