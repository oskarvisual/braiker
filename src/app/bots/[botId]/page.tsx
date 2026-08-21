import { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { orderHistoryState } from "@/modules/history/order-history";

const dateTime = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);

export default async function BotDetailPage({ params }: { params: Promise<{ botId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { botId } = await params;
  const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } }, watchlist: { where: { enabled: true }, select: { symbol: true } } } });
  if (!bot || (user.role !== "ADMIN" && !bot.wallet.members.length)) notFound();
  const proposals = await prisma.tradeProposal.findMany({ where: { botId: bot.id }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { proposalId: { in: proposals.map((proposal) => proposal.id) } }, include: { fills: { select: { quantity: true, price: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const isDead = bot.lifeStatus === "DEAD";
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><header><div><p className="eyebrow">BOT DETAIL · {bot.templateId}</p><h1>{bot.name}</h1><p className="pageLead">{isDead ? "This bot is permanently retired. Its operating history remains available." : "Survival protection and the configured risk limits remain in effect."}</p></div><Link className="secondaryButton" href="/activity">Back to History</Link></header><section className="historySummary botDetailSummary"><div><small>Status</small><strong>{isDead ? "Dead" : bot.runMode === "PAPER_ACTIVE" && !bot.killSwitch ? "On" : "Off"}</strong></div><div><small>Current capital</small><strong>${bot.currentCapital.toString()}</strong></div><div><small>Max position</small><strong>${(bot.riskPolicy as { maxPositionSize: string }).maxPositionSize}</strong></div><div><small>Universe</small><strong>{bot.watchlist.length}</strong></div></section><section className="panel simpleTablePanel"><div className="panelHeading"><div><p className="eyebrow">ORDERS</p><h2>Bot history</h2></div><span className="muted">{orders.length} recorded</span></div><div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Order</span><span>Progress</span><span>Status</span><span>Average fill</span></div>{orders.length ? orders.map((order) => { const filled = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0)); const state = orderHistoryState(order.status); return <div className="historyRow" key={order.id}><span>{dateTime(order.createdAt)}</span><span><strong>{order.action} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity.toString()} shares</small></span><span>{filled.toString()} / {order.quantity.toString()}</span><span><strong className={`historyStatus ${state.toLowerCase()}`}>{state.replaceAll("_", " ")}</strong><small>{order.status.toLowerCase()}</small></span><span>{order.fills[0]?.price ? `$${order.fills[0].price.toString()}` : "—"}</span></div>; }) : <div className="historyEmpty"><strong>No BrAIker orders for this bot yet.</strong><p>Turning a bot on changes its state; it does not yet run an autonomous trading strategy.</p></div>}</div></section></main></>;
}
