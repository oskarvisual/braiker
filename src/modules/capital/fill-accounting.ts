const SCALE = 1_000_000_000_000n;

function parse(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) throw new Error("INVALID_MONEY");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

function format(value: bigint) {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(12, "0");
  return `${whole}.${fraction}`;
}

/** Applies a confirmed broker fill to exactly one bot's virtual cash ledger. */
export function applyBotFill(input: { action: "BUY" | "SELL"; currentCapital: string; reservedCapital: string; fillQuantity: string; fillPrice: string; reservedForOrder: string; remainingPositionQuantity?: string }) {
  const current = parse(input.currentCapital);
  const reserved = parse(input.reservedCapital);
  const notional = parse(input.fillQuantity) * parse(input.fillPrice) / SCALE;
  const reservation = parse(input.reservedForOrder);
  const currentCapital = input.action === "BUY" ? (current > notional ? current - notional : 0n) : current + notional;
  const reservedCapital = reserved > reservation ? reserved - reservation : 0n;
  const remainingPosition = input.remainingPositionQuantity === undefined ? 1n : parse(input.remainingPositionQuantity);
  return { currentCapital: format(currentCapital), reservedCapital: format(reservedCapital), lifeStatus: currentCapital <= 0n && remainingPosition <= 0n ? "DEAD" as const : "ACTIVE" as const };
}

/** Releases the virtual cash reserved for a terminal order that did not fill. */
export function releaseBotReservation(input: { currentCapital: string; reservedCapital: string; reservedForOrder: string }) {
  const current = parse(input.currentCapital);
  const reserved = parse(input.reservedCapital);
  const reservation = parse(input.reservedForOrder);
  return {
    currentCapital: format(current),
    reservedCapital: format(reserved > reservation ? reserved - reservation : 0n)
  };
}
