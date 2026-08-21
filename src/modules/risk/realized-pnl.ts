import { Prisma } from "@prisma/client";

type FillAggregateSource = {
  aggregate(args: {
    where: { botId: string; filledAt: { gte: Date; lte: Date } };
    _sum: { realizedPnl: true };
  }): Promise<{ _sum: { realizedPnl: Prisma.Decimal | string | null } }>;
};

function utcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Realized P&L is the durable loss source for risk policy windows. */
export async function realizedPnlWindows(fills: FillAggregateSource, botId: string, now = new Date()) {
  const dayStart = utcDayStart(now);
  const rollingWeekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const query = (gte: Date) => fills.aggregate({ where: { botId, filledAt: { gte, lte: now } }, _sum: { realizedPnl: true } });
  const [daily, weekly] = await Promise.all([query(dayStart), query(rollingWeekStart)]);
  return {
    dailyPnl: daily._sum.realizedPnl?.toString() ?? "0",
    weeklyPnl: weekly._sum.realizedPnl?.toString() ?? "0"
  };
}
