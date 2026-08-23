"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { useToast } from "@/components/toast";

type DashboardData = {
  wallet: { id: string; name: string; walletCount: number; managedCapital: string; unallocatedCapital: string; allocatedCapital: string };
  account: { equity: string; cash: string; exposure: string; capturedAt: string; sevenDayPnl: string | null } | null;
  chart: Array<{ capturedAt: string; equity: string }>;
  positions: Array<{ symbol: string; quantity: string; marketValue: string; averageEntryPrice: string; unrealizedPnl: string }>;
  orders: Array<{ id: string; symbol: string; side: string; orderType: string; status: string; quantity: string; filledQuantity: string; filledAveragePrice: string | null; submittedAt: string }>;
  bots: Array<{ id: string; name: string; templateId: string; avatarSeed: string; runMode: string; lifeStatus: "ACTIVE" | "DEAD"; currentCapital: string; initialCapital: string; symbols: string[] }>;
};

const money = (value: string | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function EquityChart({ points }: { points: DashboardData["chart"] }) {
  if (points.length < 2) return <p className="muted">Waiting for enough Alpaca history to draw the 7-day equity trend.</p>;
  const values = points.map((point) => Number(point.equity));
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const path = points.map((point, index) => `${(index / (points.length - 1)) * 100},${90 - ((Number(point.equity) - min) / range) * 72}`).join(" ");
  return <div className="equityChart"><div className="chartScale"><span>{money(String(max))}</span><span>{money(String(min))}</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Seven-day Alpaca Paper equity"><polyline points={path} /></svg><div className="chartLabels"><span>{timestamp(points[0].capturedAt)}</span><span>{timestamp(points.at(-1)!.capturedAt)}</span></div></div>;
}

export function Dashboard({ user, data }: { user: { email: string; role: "ADMIN" | "OPERATOR" | "VIEWER" }; data: DashboardData | null }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  async function sync() {
    if (!data) return; setSyncing(true);
    const response = await fetch(`/api/dashboard/sync?walletId=${data.wallet.id}`, { method: "POST" });
    const body = await response.json(); setSyncing(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Alpaca Paper could not be synchronized", message: body.error ?? "Please try again." }); return; }
    pushToast({ tone: "success", title: "Alpaca Paper synchronized", message: `Updated ${timestamp(body.synchronizedAt)}.` }); router.refresh();
  }
  if (!data) return <><AppNavigation user={user} /><main className="shell appContent"><header><div><p className="eyebrow">BRAIKER · PAPER ONLY</p><h1>Control room</h1></div></header><section className="panel emptyDashboard"><p className="eyebrow">NO PAPER WALLET</p><h2>Connect a wallet to start monitoring</h2><p>Portfolio, positions, orders and bot budgets appear here only after a Paper wallet is configured.</p></section></main></>;
  const activeBots = data.bots.filter((bot) => bot.runMode === "PAPER_ACTIVE").length;
  const offBots = data.bots.filter((bot) => bot.lifeStatus === "ACTIVE" && bot.runMode !== "PAPER_ACTIVE").length;
  const deadBots = data.bots.filter((bot) => bot.lifeStatus === "DEAD").length;
  return <><AppNavigation user={user} /><main className="shell appContent">
    <header><div><p className="eyebrow">ALPACA PAPER · {data.wallet.name}</p><h1>Control room</h1></div>{user.role === "ADMIN" && <button className="secondaryButton" onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync Alpaca"}</button>}</header>
    <section className="cards"><article className="card"><p>ALPACA PAPER EQUITY</p><strong>{money(data.account?.equity ?? null)}</strong><small>Last sync: {data.account ? timestamp(data.account.capturedAt) : "not available"}</small></article><article className="card"><p>CASH</p><strong>{money(data.account?.cash ?? null)}</strong><small>Broker account cash</small></article><article className="card"><p>7-DAY P&L</p><strong className={(Number(data.account?.sevenDayPnl ?? 0) < 0) ? "negative" : "positive"}>{money(data.account?.sevenDayPnl ?? null)}</strong><small>Alpaca equity change</small></article><article className="card"><p>BOT LIQUID CAPITAL</p><strong>{money(data.wallet.allocatedCapital)}</strong><small>{money(data.wallet.unallocatedCapital)} unassigned across {money(data.wallet.managedCapital)} in {data.wallet.walletCount} virtual wallets</small></article></section>
    <section className="dashboardGrid"><article className="panel chartPanel"><div className="panelHeading"><div><p className="eyebrow">PORTFOLIO</p><h2>Equity · last 7 days</h2></div><span>Paper account</span></div><EquityChart points={data.chart} /></article><article className="panel"><p className="eyebrow">BOT FLEET</p><h2>{activeBots} on · {offBots} off</h2><p className="muted">{deadBots ? `${deadBots} dead bot${deadBots === 1 ? "" : "s"} retained for reports.` : "No dead bots."}</p><div className="botSummary">{data.bots.length === 0 ? <p className="muted">No bots yet. Allocate capital from Setup.</p> : data.bots.map((bot) => <div key={bot.id}><p><strong>{bot.name}</strong><small>{bot.lifeStatus === "DEAD" ? "DEAD" : bot.runMode === "PAPER_ACTIVE" ? "ON" : "OFF"} · {money(bot.currentCapital)}</small></p></div>)}</div></article><article className="panel"><p className="eyebrow">POSITIONS</p><h2>Current portfolio</h2>{data.positions.length === 0 ? <p className="muted">No Alpaca Paper positions.</p> : <div className="dataTable">{data.positions.map((position) => <div key={position.symbol}><strong>{position.symbol}</strong><span>{position.quantity} shares</span><span>{money(position.marketValue)}</span></div>)}</div>}</article><article className="panel"><p className="eyebrow">RECENT ORDERS</p><h2>Broker activity</h2>{data.orders.length === 0 ? <p className="muted">No orders reported by Alpaca Paper.</p> : <div className="dataTable">{data.orders.map((order) => <div key={order.id}><strong>{order.side.toUpperCase()} {order.symbol}</strong><span>{order.status}</span><span>{timestamp(order.submittedAt)}</span></div>)}</div>}</article></section>
  </main></>;
}
