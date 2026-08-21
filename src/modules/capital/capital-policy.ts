const SCALE = 1_000_000_000_000n;

function parseMoney(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

export function validateBudgetAllocation(input: { unallocatedCapital: string; requestedBudget: string }) {
  const available = parseMoney(input.unallocatedCapital);
  const requested = parseMoney(input.requestedBudget);
  if (available === null || requested === null || requested <= 0n) return "INVALID_BOT_BUDGET";
  if (requested > available) return "INSUFFICIENT_UNALLOCATED_CAPITAL";
  return null;
}

export function validateCapitalAdjustment(input: { direction: "ADD" | "WITHDRAW"; walletUnallocatedCapital: string; botCurrentCapital: string; amount: string }) {
  const amount = parseMoney(input.amount);
  const currentCapital = parseMoney(input.botCurrentCapital);
  if (amount === null || currentCapital === null || amount <= 0n) return "INVALID_CAPITAL_ADJUSTMENT";
  if (input.direction === "ADD") return validateBudgetAllocation({ unallocatedCapital: input.walletUnallocatedCapital, requestedBudget: input.amount });
  if (amount >= currentCapital) return "WITHDRAWAL_MUST_LEAVE_CAPITAL";
  return null;
}

export function botLifeStatus(currentCapital: string) {
  const capital = parseMoney(currentCapital);
  if (capital === null || capital <= 0n) return "DEAD";
  return "ACTIVE";
}
