export function marketEvaluationKey(input: { botId: string; symbol: string; timeframe: string; timestamp: Date }) {
  return `${input.botId}:${input.symbol}:${input.timeframe}:${input.timestamp.toISOString()}`;
}

/** A 1-minute bar is tradable only after its minute has completed. */
export function shouldAcceptBar(timestamp: Date, now = new Date()) {
  return timestamp.getTime() + 60_000 <= now.getTime();
}
