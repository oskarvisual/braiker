import { Prisma } from "@prisma/client";

type ReservableProposal = {
  action: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: string;
  estimatedPrice: string;
  limitPrice?: string;
};

/** The reservation mirrors risk's market-order buffer and never uses floats. */
export function reservationAmount(proposal: ReservableProposal, marketOrderBufferPct: string) {
  if (proposal.action !== "BUY") return "0";
  const price = new Prisma.Decimal(proposal.orderType === "MARKET" ? proposal.estimatedPrice : proposal.limitPrice ?? "0");
  const bufferedPrice = proposal.orderType === "MARKET"
    ? price.mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(marketOrderBufferPct)))
    : price;
  return new Prisma.Decimal(proposal.quantity).mul(bufferedPrice).toString();
}

/**
 * Atomically reserves only currently available virtual cash. The conditional
 * update is the concurrency boundary: competing proposals cannot overbook it.
 */
export async function reserveBotCapital(
  tx: Prisma.TransactionClient,
  input: { botId: string; amount: string }
) {
  if (new Prisma.Decimal(input.amount).lte(0)) return true;
  const affected = await tx.$executeRaw`
    UPDATE \`BotInstance\`
    SET \`reservedCapital\` = \`reservedCapital\` + ${new Prisma.Decimal(input.amount)}
    WHERE \`id\` = ${input.botId}
      AND \`lifeStatus\` = 'ACTIVE'
      AND \`runMode\` = 'PAPER_ACTIVE'
      AND \`status\` = 'RUNNING'
      AND \`killSwitch\` = false
      AND (\`currentCapital\` - \`reservedCapital\`) >= ${new Prisma.Decimal(input.amount)}
  `;
  return affected === 1;
}
