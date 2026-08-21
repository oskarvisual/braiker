import { Prisma } from "@prisma/client";

type PoolInput = {
  managedCapital: string;
  allocatedCapital: string;
  requestedWalletCapital: string;
  brokerCash: string;
};

type WalletCapitalAdjustmentInput = {
  direction: "ADD" | "WITHDRAW";
  walletUnallocatedCapital: string;
  globalAvailableCapital: string;
  amount: string;
};

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function print(value: Prisma.Decimal) {
  return value.toDecimalPlaces(12).toString();
}

export function availablePaperCapital(input: Pick<PoolInput, "managedCapital" | "allocatedCapital">) {
  return print(Prisma.Decimal.max(new Prisma.Decimal(0), decimal(input.managedCapital).minus(input.allocatedCapital)));
}

export function validatePaperCapitalPool(input: PoolInput) {
  const managed = decimal(input.managedCapital);
  const allocated = decimal(input.allocatedCapital);
  const requested = decimal(input.requestedWalletCapital);
  const cash = decimal(input.brokerCash);
  if (managed.lt(allocated) || requested.gt(availablePaperCapital(input))) return "INSUFFICIENT_PAPER_CAPITAL";
  if (managed.gt(cash)) return "PAPER_CAPITAL_EXCEEDS_BROKER_CASH";
  return null;
}

export function validateVirtualWalletCapitalAdjustment(input: WalletCapitalAdjustmentInput) {
  const amount = decimal(input.amount);
  if (amount.lte(0)) return "INVALID_VIRTUAL_CAPITAL";
  if (input.direction === "ADD" && amount.gt(decimal(input.globalAvailableCapital))) return "INSUFFICIENT_PAPER_CAPITAL";
  if (input.direction === "WITHDRAW" && amount.gt(decimal(input.walletUnallocatedCapital))) return "WALLET_CAPITAL_ASSIGNED_TO_BOTS";
  return null;
}
