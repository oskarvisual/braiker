"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { historyStates, type OrderHistoryState } from "@/modules/history/order-history";

type HistoryOrder = {
  id: string;
  botId: string | null;
  botName: string | null;
  symbol: string;
  side: string;
  orderType: string;
  quantity: string;
  filledQuantity: string;
  averagePrice: string | null;
  brokerStatus: string;
  historyState: OrderHistoryState;
  submittedAt: string;
  source: "BRAIKER" | "ALPACA";
};

const stateLabels: Record<OrderHistoryState, string> = { OPEN: "Open", IN_PROGRESS: "In progress", CLOSED: "Closed", REJECTED: "Rejected" };
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function ActivityFeed({ orders, bots }: { orders: HistoryOrder[]; bots: Array<{ id: string; name: string }> }) {
  const [botId, setBotId] = useState("ALL");
  const [state, setState] = useState<"ALL" | OrderHistoryState>("ALL");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => orders.filter((order) => (botId === "ALL" || (botId === "UNASSIGNED" ? !order.botId : order.botId === botId)) && (state === "ALL" || order.historyState === state) && (!query.trim() || `${order.symbol} ${order.side} ${order.brokerStatus}`.toLowerCase().includes(query.trim().toLowerCase()))), [botId, orders, query, state]);
  const counts = useMemo(() => Object.fromEntries(historyStates.map((entry) => [entry, orders.filter((order) => order.historyState === entry).length])) as Record<OrderHistoryState, number>, [orders]);

  return <>
    <header><div><p className="eyebrow">TRADING HISTORY</p><h1>History</h1><p className="pageLead">Every broker order in one place. Filter its lifecycle and trace it back to the bot that made it.</p></div></header>
    <section className="historySummary" aria-label="Order totals">{historyStates.map((entry) => <div key={entry}><small>{stateLabels[entry]}</small><strong>{counts[entry]}</strong></div>)}</section>
    <section className="panel simpleTablePanel historyPanel"><div className="historyFilters"><label>Order status<select value={state} onChange={(event) => setState(event.target.value as "ALL" | OrderHistoryState)}><option value="ALL">All statuses</option>{historyStates.map((entry) => <option key={entry} value={entry}>{stateLabels[entry]}</option>)}</select></label><label>Bot<select value={botId} onChange={(event) => setBotId(event.target.value)}><option value="ALL">All bots</option><option value="UNASSIGNED">No bot / external</option>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label><label>Find symbol<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AAPL, buy, filled…" /></label></div>
      <div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Bot</span><span>Order</span><span>Progress</span><span>Status</span></div>{filtered.length ? filtered.map((order) => <div className="historyRow" key={order.id}><span>{dateTime(order.submittedAt)}<small>{order.source === "BRAIKER" ? "BrAIker order" : "Alpaca / no bot linked"}</small></span><span>{order.botId && order.botName ? <Link href={`/bots/${order.botId}`} className="botHistoryLink">{order.botName}</Link> : <em className="externalOrder">No bot linked</em>}</span><span><strong>{order.side.toUpperCase()} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity} shares</small></span><span>{order.filledQuantity} / {order.quantity}<small>{order.averagePrice ? `Avg. $${order.averagePrice}` : "Awaiting fill"}</small></span><span><strong className={`historyStatus ${order.historyState.toLowerCase()}`}>{stateLabels[order.historyState]}</strong><small>{order.brokerStatus.replaceAll("_", " ").toLowerCase()}</small></span></div>) : <div className="historyEmpty"><strong>No orders match these filters.</strong><p>Orders will appear after Alpaca reports them or BrAIker submits an approved proposal.</p></div>}</div>
    </section>
  </>;
}
