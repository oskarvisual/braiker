import { createHash, randomBytes } from "node:crypto";
import { ManagerActionKind, type PrismaClient, UserRole } from "@prisma/client";
import { applyBotControl, type BotControl } from "@/modules/bots/control";

const CONFIRMATION_TTL_MS = 10 * 60_000;

type ProposalDb = Pick<PrismaClient, "managerActionProposal">;

export type ManagerAction = BotControl;
export type PendingManagerActionProposal = { id: string; action: ManagerAction; botName: string; expiresAt: Date };

export function createManagerConfirmationCode() {
  return randomBytes(6).toString("hex").toUpperCase();
}

export function hashManagerConfirmationCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function proposalExpiry(now: Date) {
  return new Date(now.getTime() + CONFIRMATION_TTL_MS);
}

function assertAdmin(role: UserRole) {
  if (role !== "ADMIN") throw new Error("FORBIDDEN");
}

/**
 * Chat and Telegram can only prepare an allowlisted change. The raw code is
 * returned once to the caller and never stored in the database.
 */
export async function createManagerActionProposal(
  input: { userId: string; actorRole: UserRole; botId: string; action: ManagerAction; requestedVia?: "WEB" | "TELEGRAM"; now?: Date; code?: string },
  db: ProposalDb
) {
  assertAdmin(input.actorRole);
  const now = input.now ?? new Date();
  const confirmationCode = input.code ?? createManagerConfirmationCode();
  const proposal = await db.managerActionProposal.create({
    data: {
      userId: input.userId,
      botId: input.botId,
      action: input.action as ManagerActionKind,
      status: "PENDING",
      codeHash: hashManagerConfirmationCode(confirmationCode),
      requestedVia: input.requestedVia ?? "WEB",
      expiresAt: proposalExpiry(now)
    },
    select: { id: true, expiresAt: true }
  });
  return { ...proposal, confirmationCode };
}

/** Pending web confirmations are durable: reloading the chat cannot hide a
 * change that is still waiting for the administrator's explicit approval. */
export async function listPendingManagerActionProposals(userId: string, db: ProposalDb, now = new Date()): Promise<PendingManagerActionProposal[]> {
  const proposals = await db.managerActionProposal.findMany({
    where: { userId, status: "PENDING", expiresAt: { gt: now } },
    select: { id: true, action: true, expiresAt: true, bot: { select: { name: true } } },
    orderBy: { expiresAt: "asc" },
    take: 10
  });
  return proposals.map((proposal) => ({ id: proposal.id, action: proposal.action as ManagerAction, botName: proposal.bot.name, expiresAt: proposal.expiresAt }));
}

/**
 * Atomically consumes the proposal before applying the normal locked control.
 * The control service rechecks membership, life status, risk state, and kill
 * switch ordering immediately before persistence.
 */
export async function confirmManagerActionProposal(
  input: { proposalId: string; actorId: string; actorRole: UserRole; channel: "WEB" | "TELEGRAM"; confirmationCode?: string; now?: Date },
  dependencies: { db: ProposalDb; applyControl?: typeof applyBotControl }
) {
  assertAdmin(input.actorRole);
  if (input.channel === "TELEGRAM" && !input.confirmationCode) throw new Error("MANAGER_ACTION_CONFIRMATION_INVALID");
  const now = input.now ?? new Date();
  const claimed = await dependencies.db.managerActionProposal.updateMany({
    where: {
      id: input.proposalId,
      userId: input.actorId,
      status: "PENDING",
      expiresAt: { gt: now },
      ...(input.channel === "TELEGRAM" ? { codeHash: hashManagerConfirmationCode(input.confirmationCode!) } : {})
    },
    data: { status: "CONFIRMING", confirmedAt: now }
  });
  if (claimed.count !== 1) throw new Error("MANAGER_ACTION_CONFIRMATION_INVALID");

  // Re-read only after the claim; it cannot be re-used even if the action is
  // rejected by the control transaction because the world changed.
  const proposal = await dependencies.db.managerActionProposal.findUnique({
    where: { id: input.proposalId },
    select: { botId: true, action: true }
  });
  if (!proposal) throw new Error("MANAGER_ACTION_CONFIRMATION_INVALID");
  try {
    const bot = await (dependencies.applyControl ?? applyBotControl)({
      botId: proposal.botId,
      action: proposal.action as BotControl,
      actorId: input.actorId,
      actorRole: input.actorRole,
      // The control transaction must run against the same database that
      // atomically claimed the proposal (including isolated MySQL tests).
      db: dependencies.db as PrismaClient
    });
    await dependencies.db.managerActionProposal.update({ where: { id: input.proposalId }, data: { status: "EXECUTED", executedAt: now } });
    return bot;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message.slice(0, 120) : "MANAGER_ACTION_EXECUTION_FAILED";
    await dependencies.db.managerActionProposal.update({ where: { id: input.proposalId }, data: { status: "FAILED", failureReason } });
    throw error;
  }
}
