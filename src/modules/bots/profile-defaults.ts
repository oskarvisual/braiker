import { prisma } from "@/lib/prisma";
import { applyTemplateRiskLimits, type BotRiskLimits } from "@/modules/bots/bot-customization";
import { getBotTemplate, listBotTemplates, type BotTemplateId } from "@/modules/bots/bot-templates";
import type { RiskPolicy } from "@/modules/risk/types";

type StoredLimits = Partial<BotRiskLimits>;

function storedLimits(value: unknown): StoredLimits | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.maxPositionSize !== "string" || typeof candidate.maxDailyLoss !== "string" || !Number.isInteger(candidate.maxTradesPerDay)) return null;
  return { maxPositionSize: candidate.maxPositionSize, maxDailyLoss: candidate.maxDailyLoss, maxTradesPerDay: candidate.maxTradesPerDay as number };
}

function configuredRiskPolicy(base: RiskPolicy, stored: unknown): RiskPolicy {
  const limits = storedLimits(stored);
  if (!limits?.maxPositionSize || !limits.maxDailyLoss || limits.maxTradesPerDay === undefined) return base;
  try {
    return applyTemplateRiskLimits(base, limits as BotRiskLimits);
  } catch {
    // A corrupt/stale row must never make the app riskier than its source profile.
    return base;
  }
}

export async function listConfiguredBotTemplates() {
  const defaults = await prisma.botProfileDefault.findMany();
  const byTemplate = new Map(defaults.map((item) => [item.templateId, item.riskPolicy]));
  return listBotTemplates().map((template) => ({ ...template, riskPolicy: configuredRiskPolicy(template.riskPolicy, byTemplate.get(template.id)) }));
}

export async function getConfiguredBotTemplate(templateId: BotTemplateId) {
  const template = getBotTemplate(templateId);
  const configured = await prisma.botProfileDefault.findUnique({ where: { templateId } });
  return { ...template, riskPolicy: configuredRiskPolicy(template.riskPolicy, configured?.riskPolicy) };
}

export function defaultRiskLimits(riskPolicy: RiskPolicy): BotRiskLimits {
  return { maxPositionSize: riskPolicy.maxPositionSize, maxDailyLoss: riskPolicy.maxDailyLoss, maxTradesPerDay: riskPolicy.maxTradesPerDay };
}
