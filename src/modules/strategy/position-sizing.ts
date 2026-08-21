const SCALE = 1_000_000_000_000n;

function parse(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

function format(value: bigint) {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(12, "0");
  return `${whole}.${fraction}`;
}

/**
 * Converts a confidence score into a conservative, deterministic notional.
 * The quantity is fractional because Alpaca Paper supports fractional equities.
 */
export function sizePosition(input: { price: string; confidence: number; availableCapital: string; currentExposure: string; maxPositionSize: string; maxPortfolioExposure: string }) {
  const price = parse(input.price);
  const availableCapital = parse(input.availableCapital);
  const currentExposure = parse(input.currentExposure);
  const maxPosition = parse(input.maxPositionSize);
  const maxExposure = parse(input.maxPortfolioExposure);
  if (price === null || availableCapital === null || currentExposure === null || maxPosition === null || maxExposure === null || price <= 0n || input.confidence <= 0) return null;
  const remainingExposure = maxExposure > currentExposure ? maxExposure - currentExposure : 0n;
  const confidence = BigInt(Math.min(100, Math.max(0, Math.round(input.confidence))));
  const scoredCap = maxPosition * confidence / 100n;
  const notional = [availableCapital, remainingExposure, maxPosition, scoredCap].reduce((lowest, value) => value < lowest ? value : lowest);
  if (notional <= 0n) return null;
  const quantity = notional * SCALE / price;
  if (quantity <= 0n) return null;
  return { quantity: format(quantity), estimatedValue: format(quantity * price / SCALE) };
}
