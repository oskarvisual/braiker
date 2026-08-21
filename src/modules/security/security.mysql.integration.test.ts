import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BotRunMode, BotStatus, JobStatus, OrderStatus, Prisma, PrismaClient, TradeAction } from "@prisma/client";
import { reconcileBotOrder } from "@/modules/broker/paper-sync";
import { reserveBotCapital } from "@/modules/decision/reservation";
import { processOneExecutionJob } from "@/modules/execution/execution-worker";
import { realizedPnlWindows } from "@/modules/risk/realized-pnl";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

async function makeBot(input: Partial<{ currentCapital: string; reservedCapital: string; killSwitch: boolean; status: BotStatus; runMode: BotRunMode }> = {}) {
  if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
  const wallet = await db.wallet.create({ data: { name: `test-wallet-${crypto.randomUUID()}`, managedCapital: "100", unallocatedCapital: "100" } });
  return db.botInstance.create({
    data: {
      walletId: wallet.id,
      name: `test-bot-${crypto.randomUUID()}`,
      riskPolicy: {},
      strategyProfile: {},
      currentCapital: input.currentCapital ?? "10",
      initialCapital: input.currentCapital ?? "10",
      reservedCapital: input.reservedCapital ?? "0",
      killSwitch: input.killSwitch ?? false,
      status: input.status ?? BotStatus.RUNNING,
      runMode: input.runMode ?? BotRunMode.PAPER_ACTIVE
    }
  });
}

async function makeProposal(botId: string, input: Partial<{ action: TradeAction; reservationAmount: string; estimatedPrice: string }> = {}) {
  if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
  const proposal = await db.tradeProposal.create({
    data: {
      botId,
      symbol: "SPY",
      action: input.action ?? TradeAction.BUY,
      orderType: "MARKET",
      quantity: "1",
      estimatedPrice: input.estimatedPrice ?? "10",
      reservationAmount: input.reservationAmount ?? "10",
      status: "RISK_APPROVED",
      context: {}
    }
  });
  await db.riskDecision.create({ data: { proposalId: proposal.id, approved: true, reason: "APPROVED", checks: [] } });
  return proposal;
}

describeMysql("security financial transaction boundaries (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.fill.deleteMany();
    await db.order.deleteMany();
    await db.executionJob.deleteMany();
    await db.riskDecision.deleteMany();
    await db.tradeProposal.deleteMany();
    await db.botPosition.deleteMany();
    await db.botCapitalEvent.deleteMany();
    await db.botModeTransition.deleteMany();
    await db.botStateTransition.deleteMany();
    await db.botInstance.deleteMany();
    await db.wallet.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  it("does not over-reserve virtual capital when proposals race", async () => {
    const bot = await makeBot({ currentCapital: "10" });
    const results = await Promise.all(["first", "second"].map(() => db!.$transaction((tx) => reserveBotCapital(tx, { botId: bot.id, amount: "7" }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })));
    const persisted = await db!.botInstance.findUniqueOrThrow({ where: { id: bot.id } });
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(persisted.reservedCapital.toString()).toBe("7");
  });

  it("claims a terminal reconciliation once and never releases a reservation twice", async () => {
    const bot = await makeBot({ currentCapital: "10", reservedCapital: "10" });
    const proposal = await makeProposal(bot.id, { reservationAmount: "10" });
    const order = await db!.order.create({ data: { proposalId: proposal.id, clientOrderId: `reconcile-${crypto.randomUUID()}`, symbol: "SPY", action: TradeAction.BUY, orderType: "MARKET", quantity: "1", status: OrderStatus.NEW } });
    const brokerOrder = { id: `broker-${crypto.randomUUID()}`, clientOrderId: order.clientOrderId, status: "filled", raw: { symbol: "SPY", side: "buy", type: "market", qty: "1", filled_qty: "1", filled_avg_price: "10", submitted_at: "2026-08-20T00:00:00.000Z", filled_at: "2026-08-20T00:01:00.000Z" } };
    await Promise.all([1, 2].map(() => db!.$transaction((tx) => reconcileBotOrder(tx, brokerOrder), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })));
    const [persisted, fills] = await Promise.all([db!.botInstance.findUniqueOrThrow({ where: { id: bot.id } }), db!.fill.findMany({ where: { orderId: order.id } })]);
    expect(persisted.reservedCapital.toString()).toBe("0");
    expect(persisted.currentCapital.toString()).toBe("0");
    expect(fills).toHaveLength(1);
  });

  it("uses durable realized fills for daily and rolling weekly losses", async () => {
    const bot = await makeBot();
    const proposal = await makeProposal(bot.id);
    const order = await db!.order.create({ data: { proposalId: proposal.id, clientOrderId: `pnl-${crypto.randomUUID()}`, symbol: "SPY", action: TradeAction.SELL, orderType: "MARKET", quantity: "1" } });
    await db!.fill.create({ data: { orderId: order.id, botId: bot.id, brokerFillId: `fill-${crypto.randomUUID()}`, quantity: "1", price: "8", realizedPnl: "-2.5", filledAt: new Date("2026-08-20T12:00:00.000Z") } });
    await db!.fill.create({ data: { orderId: order.id, botId: bot.id, brokerFillId: `fill-${crypto.randomUUID()}`, quantity: "1", price: "9", realizedPnl: "-1.5", filledAt: new Date("2026-08-15T12:00:00.000Z") } });
    await db!.fill.create({ data: { orderId: order.id, botId: bot.id, brokerFillId: `fill-${crypto.randomUUID()}`, quantity: "1", price: "11", realizedPnl: "4", filledAt: new Date("2026-08-13T12:00:00.000Z") } });
    await expect(realizedPnlWindows(db!.fill, bot.id, new Date("2026-08-20T18:00:00.000Z"))).resolves.toEqual({ dailyPnl: "-2.5", weeklyPnl: "-4" });
  });

  it("does not send a broker order after the persisted kill switch is on", async () => {
    const bot = await makeBot({ killSwitch: true });
    const proposal = await makeProposal(bot.id);
    await db!.executionJob.create({ data: { proposalId: proposal.id, status: JobStatus.PENDING } });
    let submissions = 0;
    const handled = await processOneExecutionJob({
      db: db!,
      broker: {
        getOrderByClientOrderId: async () => null,
        placeOrder: async () => {
          submissions += 1;
          return { id: "must-not-submit", clientOrderId: "must-not-submit", status: "new", raw: {} };
        }
      }
    });
    const job = await db!.executionJob.findFirstOrThrow();
    expect(handled).toBe(true);
    expect(submissions).toBe(0);
    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.lastError).toBe("KILL_SWITCH");
  });
});
