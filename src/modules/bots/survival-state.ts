const SCALE = 1_000_000_000_000n;

export type BotSurvivalStateCode = "THRIVING" | "STABLE" | "CAUTIOUS" | "STRESSED" | "CRITICAL" | "DEAD" | "CALIBRATING";

export type BotSurvivalState = {
  code: BotSurvivalStateCode;
  label: string;
  summary: string;
  tone: "positive" | "neutral" | "caution" | "warning" | "danger" | "muted" | "info";
};

export type BotSurvivalInput = {
  lifeStatus: "ACTIVE" | "DEAD";
  initialCapital: string;
  currentCapital: string;
  reservedCapital: string;
  openPositionCount: number;
  lastAnalysisAt: string | null;
};

const states: Record<BotSurvivalStateCode, BotSurvivalState> = {
  THRIVING: { code: "THRIVING", label: "Thriving", summary: "Liquid capital is above its starting allocation.", tone: "positive" },
  STABLE: { code: "STABLE", label: "Stable", summary: "Capital is within its expected operating range.", tone: "neutral" },
  CAUTIOUS: { code: "CAUTIOUS", label: "Cautious", summary: "Liquid capital is reduced; the bot should protect its remaining room.", tone: "caution" },
  STRESSED: { code: "STRESSED", label: "Stressed", summary: "Liquid capital is low; survival guardrails deserve attention.", tone: "warning" },
  CRITICAL: { code: "CRITICAL", label: "Critical", summary: "Very little liquid capital remains without an open deployment.", tone: "danger" },
  DEAD: { code: "DEAD", label: "Dead", summary: "This bot is permanent history only and cannot be restarted.", tone: "muted" },
  CALIBRATING: { code: "CALIBRATING", label: "Calibrating", summary: "Waiting for its first completed market analysis.", tone: "info" }
};

function parseDecimal(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) throw new Error("INVALID_MONEY");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

/**
 * Provides a read-only survival indicator. It deliberately never changes bot
 * controls, risk policy, capital accounting, or execution eligibility.
 */
export function deriveBotSurvivalState(input: BotSurvivalInput): BotSurvivalState {
  if (input.lifeStatus === "DEAD") return states.DEAD;
  if (!input.lastAnalysisAt) return states.CALIBRATING;

  const reservedCapital = parseDecimal(input.reservedCapital);
  if (input.openPositionCount > 0 || reservedCapital > 0n) {
    return { ...states.STABLE, summary: "Capital is currently deployed or reserved, so liquid cash alone is not a survival signal." };
  }

  const initialCapital = parseDecimal(input.initialCapital);
  const currentCapital = parseDecimal(input.currentCapital);
  if (initialCapital <= 0n) return states.CALIBRATING;
  if (currentCapital * 100n >= initialCapital * 105n) return states.THRIVING;
  if (currentCapital * 100n < initialCapital * 20n) return states.CRITICAL;
  if (currentCapital * 100n < initialCapital * 50n) return states.STRESSED;
  if (currentCapital * 100n < initialCapital * 85n) return states.CAUTIOUS;
  return states.STABLE;
}
