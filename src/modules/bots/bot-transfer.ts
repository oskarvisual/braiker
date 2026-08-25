import { createHash } from "node:crypto";
import { z } from "zod";

export const BOT_TRANSFER_KIND = "braiker.bot.config";
export const BOT_TRANSFER_SCHEMA_VERSION = 1;

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const templateId = z.enum(["GUARDIAN", "NAVIGATOR", "EXPLORER"]);
const learnedInstruction = z.object({
  source: z.string().trim().min(1).max(24),
  content: z.string().trim().min(1).max(1200),
  revision: z.number().int().min(1),
  active: z.boolean(),
  deactivatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
}).strict();

const portableStrategyProfile = z.object({
  strategyId: z.literal("trend-v1"),
  version: z.literal(1),
  minimumSignalScore: z.number().min(0).max(1),
  trendWeight: z.number().min(0).max(1),
  momentumWeight: z.number().min(0).max(1),
  volumeWeight: z.number().min(0).max(1),
  marketContextWeight: z.number().min(0).max(1),
  volatilityPenalty: z.number().min(0).max(1)
}).strict();

export const botTransferConfigSchema = z.object({
  name: z.string().trim().min(2).max(120),
  templateId,
  avatarSeed: z.string().trim().min(1).max(32),
  symbols: z.array(z.string().trim().min(1).max(16)).min(1).max(50),
  customInstructions: z.string().trim().max(1200),
  adaptiveRiskEnabled: z.boolean(),
  riskLimits: z.object({ maxPositionSize: money, maxDailyLoss: money, maxTradesPerDay: z.number().int().min(1) }).strict(),
  strategyProfile: portableStrategyProfile,
  learnedInstructions: z.array(learnedInstruction).max(200)
}).strict().superRefine((value, context) => {
  if (new Set(value.symbols).size !== value.symbols.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate symbols" });
  const revisions = value.learnedInstructions.map((item) => item.revision);
  if (new Set(revisions).size !== revisions.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate revisions" });
  for (const item of value.learnedInstructions) {
    if (item.active && item.deactivatedAt) context.addIssue({ code: z.ZodIssueCode.custom, message: "active revision cannot be deactivated" });
    if (!item.active && !item.deactivatedAt) context.addIssue({ code: z.ZodIssueCode.custom, message: "inactive revision requires deactivation time" });
  }
});

export type BotTransferConfig = z.infer<typeof botTransferConfigSchema>;
export type BotTransferPackage = { kind: typeof BOT_TRANSFER_KIND; schemaVersion: typeof BOT_TRANSFER_SCHEMA_VERSION; exportedAt: string; contentHash: string; bot: BotTransferConfig };

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function contentHash(bot: BotTransferConfig) {
  return createHash("sha256").update(canonical(bot)).digest("hex");
}

export function buildBotTransferPackage(config: BotTransferConfig, exportedAt = new Date()): BotTransferPackage {
  const bot = botTransferConfigSchema.parse(config);
  return { kind: BOT_TRANSFER_KIND, schemaVersion: BOT_TRANSFER_SCHEMA_VERSION, exportedAt: exportedAt.toISOString(), contentHash: contentHash(bot), bot };
}

export function parseBotTransferPackage(input: unknown): BotTransferPackage {
  if (!input || typeof input !== "object") throw new Error("BOT_IMPORT_INVALID_PACKAGE");
  const packet = input as Partial<BotTransferPackage>;
  if (packet.kind !== BOT_TRANSFER_KIND || packet.schemaVersion !== BOT_TRANSFER_SCHEMA_VERSION) throw new Error("BOT_IMPORT_UNSUPPORTED_SCHEMA");
  if (typeof packet.exportedAt !== "string" || Number.isNaN(Date.parse(packet.exportedAt)) || typeof packet.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(packet.contentHash)) throw new Error("BOT_IMPORT_INVALID_PACKAGE");
  const parsed = botTransferConfigSchema.safeParse(packet.bot);
  if (!parsed.success) throw new Error("BOT_IMPORT_INVALID_PACKAGE");
  if (contentHash(parsed.data) !== packet.contentHash) throw new Error("BOT_IMPORT_HASH_MISMATCH");
  return { kind: BOT_TRANSFER_KIND, schemaVersion: BOT_TRANSFER_SCHEMA_VERSION, exportedAt: packet.exportedAt, contentHash: packet.contentHash, bot: parsed.data };
}
