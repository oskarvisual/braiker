import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { resolveManagerChatModel } from "@/modules/manager-chat/manager-chat";
import { OpenAiManagerChat } from "@/modules/manager-chat/openai-manager-chat";
import { ensureOperationsSession, sendManagerMessage, type ManagerResponder } from "@/modules/manager-chat/manager-chat-service";
import { confirmManagerActionProposal, createManagerActionProposal, hashManagerConfirmationCode } from "@/modules/manager-chat/manager-action-proposals";

const SCOPE = "global";
const PAIRING_TTL_MS = 10 * 60_000;

export type TelegramUpdate = { updateId: string; chatId?: string; text?: string };
export type TelegramApi = { getUpdates(offset?: string): Promise<TelegramUpdate[]>; sendMessage(chatId: string, text: string): Promise<void> };

export function createTelegramPairingCode() { return randomBytes(18).toString("base64url"); }
export function hashTelegramPairingCode(code: string) { return createHash("sha256").update(code).digest("hex"); }
export function pairingExpiresAt(now = new Date()) { return new Date(now.getTime() + PAIRING_TTL_MS); }
export function parseTelegramStartCode(text: string) { const match = /^\/start\s+([^\s]{8,200})\s*$/i.exec(text.trim()); return match?.[1] ?? null; }
export function redactTelegramInboundContent(text: string) {
  const safeText = parseTelegramStartCode(text) ? "/start [redacted]" : parseTelegramConfirmation(text) ? "CONFIRMAR [redacted]" : text;
  return safeText.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[redacted-telegram-token]").slice(0, 4_000);
}

export function parseTelegramConfirmation(text: string) {
  const match = /^CONFIRMAR\s+([A-F0-9]{12})\s*$/i.exec(text.trim());
  return match?.[1]?.toUpperCase() ?? null;
}

export function parseTelegramControlCommand(text: string): { action: "TURN_ON" | "TURN_OFF"; botId: string } | null {
  const match = /^\/(on|off)\s+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*$/i.exec(text.trim());
  if (!match) return null;
  return { action: match[1].toLowerCase() === "on" ? "TURN_ON" : "TURN_OFF", botId: match[2]!.toLowerCase() };
}

/** Telegram Bot Manager begins as an explicitly read-only command session. */
export function managerReplyForCommand(text: string) {
  const command = text.trim().toLowerCase().split(/\s+/)[0];
  if (command === "/help") return "Use /status, /report, or /help for read-only information. Admins may prepare one bot change with /on <bot-id> or /off <bot-id>, then send CONFIRMAR <código>.";
  if (command === "/status") return "BrAIker Bot Manager is read-only. Use the dashboard for live service health and bot controls.";
  if (command === "/report") return "BrAIker Bot Manager is read-only. Use History and bot details for orders and decision reports.";
  return "I cannot change capital, risk settings, instructions, Kill Switches, or orders from Telegram. Use /help for read-only commands and explicit one-bot proposals.";
}

export function sanitizeTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message : "TELEGRAM_REQUEST_FAILED";
  return message.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[redacted-telegram-token]").replace(/[\r\n]+/g, " ").slice(0, 500);
}

function telegramApi(token: string): TelegramApi {
  const request = async (method: string, body: Record<string, unknown>) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED_${response.status}`);
    return response.json() as Promise<{ ok?: boolean; result?: unknown }>;
  };
  return {
    async getUpdates(offset) {
      const response = await request("getUpdates", { ...(offset ? { offset: Number(offset) } : {}), timeout: 0, allowed_updates: ["message"] });
      const updates = Array.isArray(response.result) ? response.result : [];
      return updates.flatMap((value: unknown) => {
        if (!value || typeof value !== "object") return [];
        const record = value as { update_id?: unknown; message?: { chat?: { id?: unknown }; text?: unknown } };
        const id = record.update_id; const chatId = record.message?.chat?.id; const text = record.message?.text;
        return Number.isInteger(id) ? [{ updateId: String(id), ...(typeof chatId === "number" || typeof chatId === "string" ? { chatId: String(chatId) } : {}), ...(typeof text === "string" ? { text } : {}) }] : [];
      });
    },
    async sendMessage(chatId, text) { await request("sendMessage", { chat_id: chatId, text }); }
  };
}

type TelegramDb = Pick<typeof prisma,
  "telegramRuntimeState" | "telegramPairingCode" | "telegramManagerSession" | "telegramManagerMessage" | "notificationSettings" |
  "managerChatSession" | "managerChatMessage" | "managerActionProposal" | "aiRuntimeState" | "botInstance" | "botScanRun" | "tradeProposal"
>;

/**
 * Mirrors a browser exchange only when it belongs to the paired user's pinned
 * Operations session. Manual browser conversations stay private to the web UI.
 */
export async function mirrorWebManagerExchangeToTelegram(
  input: { userId: string; sessionId: string; content: string; reply: string },
  overrides: { db?: TelegramDb; api?: TelegramApi; token?: string; now?: Date } = {}
) {
  const token = overrides.token ?? env().TELEGRAM_BOT_TOKEN;
  if (!token) return { mirrored: false };
  const db = overrides.db ?? prisma;
  const pairing = await db.telegramManagerSession.findUnique({ where: { scope: SCOPE } });
  if (!pairing || pairing.userId !== input.userId) return { mirrored: false };
  const operations = await ensureOperationsSession(input.userId, db);
  if (operations.id !== input.sessionId) return { mirrored: false };

  const now = overrides.now ?? new Date();
  const api = overrides.api ?? telegramApi(token);
  const outboundMessages = [
    `Web · You:\n${redactTelegramInboundContent(input.content)}`,
    `BrAIker:\n${redactTelegramInboundContent(input.reply)}`
  ];
  for (const content of outboundMessages) {
    await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content, createdAt: now } });
    await api.sendMessage(pairing.telegramChatId, content);
  }
  return { mirrored: true };
}

function managerResponderFromEnvironment(): ManagerResponder {
  const runtime = env();
  return new OpenAiManagerChat({
    apiKey: runtime.OPENAI_API_KEY,
    model: resolveManagerChatModel({ managerModel: runtime.BOT_MANAGER_CHAT_MODEL, defaultModel: runtime.OPENAI_MODEL }),
    timeoutMs: runtime.OPENAI_TIMEOUT_MS
  });
}

async function processUpdate(
  db: TelegramDb,
  update: TelegramUpdate,
  now: Date,
  api: TelegramApi,
  manager: { responder: ManagerResponder; aiEnabled: boolean }
) {
  const previous = await db.telegramManagerMessage.findUnique({ where: { telegramUpdateId: update.updateId } });
  if (previous) return false;
  if (!update.chatId || !update.text) return false;
  const startCode = parseTelegramStartCode(update.text);
  if (startCode) {
    const claim = await db.telegramPairingCode.updateMany({ where: { codeHash: hashTelegramPairingCode(startCode), consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (claim.count === 1) {
      const pairing = await db.telegramPairingCode.findUniqueOrThrow({ where: { codeHash: hashTelegramPairingCode(startCode) } });
      await db.telegramManagerSession.upsert({ where: { scope: SCOPE }, create: { scope: SCOPE, telegramChatId: update.chatId, userId: pairing.userId, linkedAt: now, lastReceivedAt: now }, update: { telegramChatId: update.chatId, userId: pairing.userId, linkedAt: now, lastReceivedAt: now } });
      await ensureOperationsSession(pairing.userId, db);
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, telegramUpdateId: update.updateId, direction: "INBOUND", content: redactTelegramInboundContent(update.text), createdAt: now } });
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: "Bot Manager paired. Use /help for read-only commands.", createdAt: now } });
      await api.sendMessage(update.chatId, "Bot Manager paired. Use /help for read-only commands.");
      return true;
    }
    return false;
  }
  const session = await db.telegramManagerSession.findUnique({ where: { telegramChatId: update.chatId }, include: { user: { select: { id: true, role: true } } } });
  const settings = await db.notificationSettings.findUnique({ where: { scope: SCOPE }, select: { telegramReceiveMessages: true } });
  if (!session || !settings?.telegramReceiveMessages) return false;
  await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, telegramUpdateId: update.updateId, direction: "INBOUND", content: redactTelegramInboundContent(update.text), createdAt: now } });
  await db.telegramManagerSession.update({ where: { scope: SCOPE }, data: { lastReceivedAt: now } });
  const confirmationCode = parseTelegramConfirmation(update.text);
  if (confirmationCode) {
    try {
      const proposal = await db.managerActionProposal.findFirst({ where: { userId: session.userId, status: "PENDING", codeHash: hashManagerConfirmationCode(confirmationCode) }, select: { id: true } });
      if (!proposal) throw new Error("MANAGER_ACTION_CONFIRMATION_INVALID");
      const bot = await confirmManagerActionProposal({ proposalId: proposal.id, actorId: session.user.id, actorRole: session.user.role, channel: "TELEGRAM", confirmationCode, now }, { db });
      const reply = `Confirmed. ${bot.id} is now ${bot.runMode === "PAPER_ACTIVE" ? "ON" : "OFF"}.`;
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: reply, createdAt: now } });
      await api.sendMessage(update.chatId, reply);
      return true;
    } catch {
      const reply = "That confirmation is invalid, expired, already used, or the requested change is no longer safe to apply.";
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: reply, createdAt: now } });
      await api.sendMessage(update.chatId, reply);
      return true;
    }
  }
  const control = parseTelegramControlCommand(update.text);
  if (control) {
    try {
      const proposal = await createManagerActionProposal({ userId: session.user.id, actorRole: session.user.role, botId: control.botId, action: control.action, requestedVia: "TELEGRAM", now }, db);
      const reply = `Proposal prepared: ${control.action === "TURN_ON" ? "turn ON" : "turn OFF"} bot ${control.botId}. Send CONFIRMAR ${proposal.confirmationCode} before ${proposal.expiresAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET.`;
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: redactTelegramInboundContent(reply), createdAt: now } });
      await api.sendMessage(update.chatId, reply);
      return true;
    } catch {
      const reply = "I could not prepare that change. Only the paired Admin may propose one valid bot control at a time.";
      await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: reply, createdAt: now } });
      await api.sendMessage(update.chatId, reply);
      return true;
    }
  }
  const operations = await ensureOperationsSession(session.userId, db);
  const reply = (await sendManagerMessage({
    userId: session.userId,
    sessionId: operations.id,
    content: redactTelegramInboundContent(update.text),
    source: "TELEGRAM",
    sourceReference: `telegram:${update.updateId}`
  }, { db, responder: manager.responder, aiEnabled: manager.aiEnabled })).reply;
  await db.telegramManagerMessage.create({ data: { sessionScope: SCOPE, direction: "OUTBOUND", content: reply, createdAt: now } });
  await api.sendMessage(update.chatId, reply);
  return true;
}

/** Polls Telegram only in the worker. A persisted update offset prevents duplicate replies after restart. */
export async function pollTelegramBotManager(now = new Date(), overrides: { db?: TelegramDb; api?: TelegramApi; token?: string; managerResponder?: ManagerResponder; aiEnabled?: boolean } = {}) {
  const token = overrides.token ?? env().TELEGRAM_BOT_TOKEN;
  if (!token) return { processed: 0 };
  const db = overrides.db ?? prisma;
  const state = await db.telegramRuntimeState.findUnique({ where: { scope: SCOPE } });
  const api = overrides.api ?? telegramApi(token);
  const runtime = env();
  const manager = {
    responder: overrides.managerResponder ?? managerResponderFromEnvironment(),
    aiEnabled: overrides.aiEnabled ?? (runtime.AI_ENABLED && Boolean(runtime.OPENAI_API_KEY))
  };
  const updates = await api.getUpdates(state?.nextUpdateId ?? undefined);
  let processed = 0;
  for (const update of updates) {
    if (await processUpdate(db, update, now, api, manager)) processed += 1;
    await db.telegramRuntimeState.upsert({ where: { scope: SCOPE }, create: { scope: SCOPE, nextUpdateId: String(Number(update.updateId) + 1) }, update: { nextUpdateId: String(Number(update.updateId) + 1) } });
  }
  return { processed };
}
