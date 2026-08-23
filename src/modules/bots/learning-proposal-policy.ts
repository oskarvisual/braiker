const LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const REQUIRED_LOSSES = 3;

type LossFill = { id: string; symbol: string; realizedPnl: string; filledAt: Date };

/** A single loss must never rewrite behavior. This produces only an approval candidate. */
export function lossLearningCandidate(input: { botId: string; symbol: string; now: Date; fills: LossFill[] }) {
  const losses = input.fills
    .filter((fill) => fill.symbol === input.symbol && Number(fill.realizedPnl) < 0 && fill.filledAt.getTime() >= input.now.getTime() - LOOKBACK_MS && fill.filledAt <= input.now)
    .sort((left, right) => right.filledAt.getTime() - left.filledAt.getTime())
    .slice(0, REQUIRED_LOSSES);
  if (losses.length < REQUIRED_LOSSES) return null;
  const period = input.now.toISOString().slice(0, 10);
  return {
    dedupeKey: `loss-learning:${input.botId}:${input.symbol}:${period}`,
    rule: `After repeated realized losses in ${input.symbol}, require stronger confirmation before opening new BUY exposure.`,
    evidenceFillIds: losses.map((fill) => fill.id)
  };
}
