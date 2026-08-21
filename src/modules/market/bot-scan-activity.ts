export type BotScanOutcomeInput = {
  symbol: string;
  outcome: "hold" | "no-capital" | "ai-rejected" | "approved" | "rejected" | "duplicate" | "missing-data";
};

export type BotScanOutcome = {
  symbol: string;
  outcome: "HOLD" | "NO_CAPITAL" | "AI_REJECTED" | "APPROVED" | "RISK_REJECTED" | "ALREADY_EVALUATED" | "MISSING_MARKET_DATA";
  message: string;
};

export type BotScanActivity = {
  status: "COMPLETED" | "SKIPPED" | "ERROR";
  reason: "ANALYZED" | "MARKET_CLOSED" | "NO_SYMBOLS" | "CYCLE_ERROR";
  message: string;
  outcomes: BotScanOutcome[];
};

function outcomeDetails(input: BotScanOutcomeInput): BotScanOutcome {
  switch (input.outcome) {
    case "hold": return { symbol: input.symbol, outcome: "HOLD", message: "No trade candidate met the strategy threshold." };
    case "no-capital": return { symbol: input.symbol, outcome: "NO_CAPITAL", message: "No permitted position could be funded from this bot's available capital." };
    case "ai-rejected": return { symbol: input.symbol, outcome: "AI_REJECTED", message: "Candidate was stopped by the AI advisory before risk assessment." };
    case "approved": return { symbol: input.symbol, outcome: "APPROVED", message: "Candidate passed risk checks and was queued for Paper execution." };
    case "rejected": return { symbol: input.symbol, outcome: "RISK_REJECTED", message: "Candidate was rejected by the bot's mandatory risk controls." };
    case "duplicate": return { symbol: input.symbol, outcome: "ALREADY_EVALUATED", message: "This candle was already evaluated; waiting for a newer market bar." };
    case "missing-data": return { symbol: input.symbol, outcome: "MISSING_MARKET_DATA", message: "Fresh market data was unavailable for this symbol; it will retry." };
  }
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

function summary(outcomes: BotScanOutcome[]) {
  const counted = (outcome: BotScanOutcome["outcome"]) => outcomes.filter((item) => item.outcome === outcome).length;
  const parts = [
    [counted("HOLD"), "hold"],
    [counted("APPROVED"), "approved for Paper execution"],
    [counted("RISK_REJECTED"), "rejected by risk controls"],
    [counted("AI_REJECTED"), "stopped by AI advisory"],
    [counted("NO_CAPITAL"), "without permitted capital"],
    [counted("MISSING_MARKET_DATA"), "waiting for market data"],
    [counted("ALREADY_EVALUATED"), "already evaluated"]
  ].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`);
  return `Analyzed ${outcomes.length} ${plural(outcomes.length, "symbol", "symbols")}: ${parts.join(", ")}.`;
}

/** Creates the safe, operator-facing summary persisted for one bot analysis cycle. */
export function buildBotScanActivity(input: { state: "COMPLETED" | "MARKET_CLOSED" | "NO_SYMBOLS" | "ERROR"; outcomes: BotScanOutcomeInput[] }): BotScanActivity {
  if (input.state === "MARKET_CLOSED") return { status: "SKIPPED", reason: "MARKET_CLOSED", message: "Waiting: the US regular market is closed.", outcomes: [] };
  if (input.state === "NO_SYMBOLS") return { status: "SKIPPED", reason: "NO_SYMBOLS", message: "Waiting: this bot has no enabled symbols to analyze.", outcomes: [] };
  if (input.state === "ERROR") return { status: "ERROR", reason: "CYCLE_ERROR", message: "Analysis cycle could not finish. It will retry on the next cycle.", outcomes: [] };
  const outcomes = input.outcomes.map(outcomeDetails);
  return { status: "COMPLETED", reason: "ANALYZED", message: summary(outcomes), outcomes };
}

/** Keeps overnight/no-symbol activity useful without generating minute-by-minute noise. */
export function shouldRecordSkippedActivity(input: { lastReason?: string | null; lastStartedAt?: Date | null; reason: "MARKET_CLOSED" | "NO_SYMBOLS"; now: Date }) {
  if (!input.lastStartedAt || input.lastReason !== input.reason) return true;
  return input.now.getTime() - input.lastStartedAt.getTime() >= 60 * 60_000;
}

export function botScanRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - 30 * 24 * 60 * 60_000);
}
