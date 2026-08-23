const SCALE = 1_000_000_000_000n;

function parseMoney(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) throw new Error("INVALID_MONEY");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

function formatMoney(value: bigint) {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(12, "0");
  return `${whole}.${fraction}`;
}

export type OperatingCostBot = { id: string; currentCapital: string };

/**
 * Creates deterministic virtual-cost shares. The residual goes to the last
 * sorted bot so the shares always add up to the configured monthly amount.
 */
export function allocateMonthlyOperatingCost(input: { enabled?: boolean; monthlyCost: string; bots: OperatingCostBot[] }) {
  if (input.enabled === false) return [];
  const monthlyCost = parseMoney(input.monthlyCost);
  if (monthlyCost <= 0n) return [];
  const bots = input.bots
    .map((bot) => ({ ...bot, capital: parseMoney(bot.currentCapital) }))
    .filter((bot) => bot.capital > 0n)
    .sort((left, right) => left.id.localeCompare(right.id));
  const totalCapital = bots.reduce((total, bot) => total + bot.capital, 0n);
  if (totalCapital <= 0n) return [];

  let allocated = 0n;
  return bots.map((bot, index) => {
    const amount = index === bots.length - 1 ? monthlyCost - allocated : monthlyCost * bot.capital / totalCapital;
    allocated += amount;
    return { botId: bot.id, allocatedAmount: formatMoney(amount) };
  });
}

/** A virtual operating debit can never consume money already reserved for an order. */
export function applyOperatingCostDebit(input: { currentCapital: string; reservedCapital: string; allocatedAmount: string; openPositionCount: number }) {
  const currentCapital = parseMoney(input.currentCapital);
  const reservedCapital = parseMoney(input.reservedCapital);
  const allocatedAmount = parseMoney(input.allocatedAmount);
  const availableCapital = currentCapital > reservedCapital ? currentCapital - reservedCapital : 0n;
  const chargedAmount = allocatedAmount < availableCapital ? allocatedAmount : availableCapital;
  const capitalAfter = currentCapital - chargedAmount;
  const unpaidAmount = allocatedAmount - chargedAmount;
  return {
    chargedAmount: formatMoney(chargedAmount),
    unpaidAmount: formatMoney(unpaidAmount),
    capitalAfter: formatMoney(capitalAfter),
    lifeStatus: capitalAfter <= 0n && input.openPositionCount <= 0 ? "DEAD" as const : "ACTIVE" as const
  };
}

export function monthlyOperatingCostBillingMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("BILLING_MONTH_UNAVAILABLE");
  return new Date(`${year}-${month}-01T00:00:00.000Z`);
}
