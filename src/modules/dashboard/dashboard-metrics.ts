const SCALE = 1_000_000_000_000n;

function parseMoney(value: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(value)) throw new Error("INVALID_MONEY");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt((fraction + "000000000000").slice(0, 12));
}

function formatMoney(value: bigint) {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(12, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Dashboard totals are virtual accounting, never a broker-account allocation. */
export function botCapitalBreakdown(input: { wallets: Array<{ managedCapital: string; unallocatedCapital: string }>; botCapitals: string[] }) {
  return {
    currentBotCapital: formatMoney(input.botCapitals.reduce((total, capital) => total + parseMoney(capital), 0n)),
    unallocatedCapital: formatMoney(input.wallets.reduce((total, wallet) => total + parseMoney(wallet.unallocatedCapital), 0n)),
    managedCapital: formatMoney(input.wallets.reduce((total, wallet) => total + parseMoney(wallet.managedCapital), 0n))
  };
}

/** Alpaca history can contain a startup placeholder. Never graph a zero equity point. */
export function positiveEquitySnapshots<T extends { equity: string }>(snapshots: T[]) {
  return snapshots.filter((snapshot) => parseMoney(snapshot.equity) > 0n);
}
