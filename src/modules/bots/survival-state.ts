const SCALE = 1_000_000_000_000n;

export type BotSurvivalStateCode = "THRIVING" | "STABLE" | "CAUTIOUS" | "STRESSED" | "CRITICAL" | "DEAD" | "CALIBRATING";

export type BotSurvivalState = {
  code: BotSurvivalStateCode;
  label: string;
  summary: string;
  tone: "positive" | "neutral" | "caution" | "warning" | "danger" | "muted" | "info";
  /** Presentation-only ordinal for the existing deterministic survival band. */
  score: number | null;
  /** Describes only the current control state; it does not alter it. */
  operationalStatus: string;
};

export type BotSurvivalInput = {
  lifeStatus: "ACTIVE" | "DEAD";
  initialCapital: string;
  currentCapital: string;
  reservedCapital: string;
  openPositionCount: number;
  lastAnalysisAt: string | null;
  killSwitch?: boolean;
};

const states: Record<BotSurvivalStateCode, BotSurvivalState> = {
  THRIVING: { code: "THRIVING", label: "Thriving", summary: "Liquid capital is above its starting allocation.", tone: "positive", score: 100, operationalStatus: "Operating normally" },
  STABLE: { code: "STABLE", label: "Stable", summary: "Capital is within its expected operating range.", tone: "neutral", score: 75, operationalStatus: "Operating normally" },
  CAUTIOUS: { code: "CAUTIOUS", label: "Cautious", summary: "Liquid capital is reduced; the bot should protect its remaining room.", tone: "caution", score: 60, operationalStatus: "Operating normally" },
  STRESSED: { code: "STRESSED", label: "Stressed", summary: "Liquid capital is low; survival guardrails deserve attention.", tone: "warning", score: 40, operationalStatus: "Operating normally" },
  CRITICAL: { code: "CRITICAL", label: "Critical", summary: "Very little liquid capital remains without an open deployment.", tone: "danger", score: 15, operationalStatus: "Operating normally" },
  DEAD: { code: "DEAD", label: "Dead", summary: "This bot is permanent history only and cannot be restarted.", tone: "muted", score: 0, operationalStatus: "Trading stopped permanently" },
  CALIBRATING: { code: "CALIBRATING", label: "Calibrating", summary: "Waiting for its first completed market analysis.", tone: "info", score: null, operationalStatus: "Awaiting first analysis" }
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
  const withPowerState = (state: BotSurvivalState) => state.code !== "DEAD" && input.killSwitch ? { ...state, operationalStatus: "Trading paused" } : state;
  if (input.lifeStatus === "DEAD") return states.DEAD;
  if (!input.lastAnalysisAt) return withPowerState(states.CALIBRATING);

  const reservedCapital = parseDecimal(input.reservedCapital);
  if (input.openPositionCount > 0 || reservedCapital > 0n) {
    return withPowerState({ ...states.STABLE, summary: "Capital is currently deployed or reserved, so liquid cash alone is not a survival signal." });
  }

  const initialCapital = parseDecimal(input.initialCapital);
  const currentCapital = parseDecimal(input.currentCapital);
  if (initialCapital <= 0n) return withPowerState(states.CALIBRATING);
  if (currentCapital * 100n >= initialCapital * 105n) return withPowerState(states.THRIVING);
  if (currentCapital * 100n < initialCapital * 20n) return withPowerState(states.CRITICAL);
  if (currentCapital * 100n < initialCapital * 50n) return withPowerState(states.STRESSED);
  if (currentCapital * 100n < initialCapital * 85n) return withPowerState(states.CAUTIOUS);
  return withPowerState(states.STABLE);
}
