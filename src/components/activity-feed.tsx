"use client";

import { useMemo, useState } from "react";
import { historyStates, type OrderHistoryState } from "@/modules/history/order-history";
import { BotHistoryModal, type HistoryBot } from "@/components/bot-history-modal";
import { DecisionReportModal } from "@/components/decision-report-modal";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/modules/pagination/page";

export type HistoryOrder = {
  id: string;
  proposalId: string | null;
  walletId: string | null;
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

export function filterActivityOrders(orders: HistoryOrder[], filters: { walletId: string; botId: string; state: "ALL" | OrderHistoryState; query: string }) {
  const query = filters.query.trim().toLowerCase();
  return orders.filter((order) => (filters.walletId === "ALL" || order.walletId === filters.walletId) && (filters.botId === "ALL" || (filters.botId === "UNASSIGNED" ? !order.botId : order.botId === filters.botId)) && (filters.state === "ALL" || order.historyState === filters.state) && (!query || `${order.symbol} ${order.side} ${order.brokerStatus}`.toLowerCase().includes(query)));
}

export function ActivityFeed({ orders, bots, wallets }: { orders: HistoryOrder[]; bots: Array<{ id: string; name: string; walletId: string }>; wallets: Array<{ id: string; name: string }> }) {
  const [walletId, setWalletId] = useState("ALL");
  const [botId, setBotId] = useState("ALL");
  const [state, setState] = useState<"ALL" | OrderHistoryState>("ALL");
  const [query, setQuery] = useState("");
  const [historyBot, setHistoryBot] = useState<HistoryBot | null>(null);
  const [decisionProposalId, setDecisionProposalId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => filterActivityOrders(orders, { walletId, botId, state, query }), [botId, orders, query, state, walletId]);
  const visibleBots = useMemo(() => walletId === "ALL" ? bots : bots.filter((bot) => bot.walletId === walletId), [bots, walletId]);
  const counts = useMemo(() => Object.fromEntries(historyStates.map((entry) => [entry, orders.filter((order) => order.historyState === entry).length])) as Record<OrderHistoryState, number>, [orders]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleOrders = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <>
    <header><div><p className="eyebrow">TRADING HISTORY</p><h1>History</h1><p className="pageLead">Every broker order in one place. Filter its lifecycle and trace it back to the bot that made it.</p></div></header>
    <section className="historySummary" aria-label="Order totals">{historyStates.map((entry) => <div key={entry}><small>{stateLabels[entry]}</small><strong>{counts[entry]}</strong></div>)}</section>
    <section className="panel simpleTablePanel historyPanel"><div className="historyFilters"><label>Wallet<select value={walletId} onChange={(event) => { setWalletId(event.target.value); setBotId("ALL"); setPage(1); }}><option value="ALL">All wallets</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label><label>Order status<select value={state} onChange={(event) => { setState(event.target.value as "ALL" | OrderHistoryState); setPage(1); }}><option value="ALL">All statuses</option>{historyStates.map((entry) => <option key={entry} value={entry}>{stateLabels[entry]}</option>)}</select></label><label>Bot<select value={botId} onChange={(event) => { setBotId(event.target.value); setPage(1); }}><option value="ALL">All bots</option><option value="UNASSIGNED">No bot / external</option>{visibleBots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label><label>Find symbol<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="AAPL, buy, filled…" /></label></div>
      <div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Bot</span><span>Order</span><span>Progress</span><span>Status</span></div>{filtered.length ? visibleOrders.map((order) => <div className="historyRow" key={order.id}><span>{dateTime(order.submittedAt)}<small>{order.source === "BRAIKER" ? "BrAIker order" : "Alpaca / no bot linked"}</small></span><span>{order.botId && order.botName ? <button type="button" className="botHistoryLink" aria-haspopup="dialog" aria-label={`View ${order.botName} history`} onClick={() => setHistoryBot({ id: order.botId!, name: order.botName! })}>{order.botName}</button> : <em className="externalOrder">No bot linked</em>}</span><span><strong>{order.side.toUpperCase()} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity} shares</small></span><span>{order.filledQuantity} / {order.quantity}<small>{order.averagePrice ? `Avg. $${order.averagePrice}` : "Awaiting fill"}</small></span><span><strong className={`historyStatus ${order.historyState.toLowerCase()}`}>{stateLabels[order.historyState]}</strong><small>{order.brokerStatus.replaceAll("_", " ").toLowerCase()}</small>{order.proposalId ? <button type="button" className="decisionReportLink" aria-haspopup="dialog" onClick={() => setDecisionProposalId(order.proposalId)}>Decision report</button> : null}</span></div>) : <div className="historyEmpty"><strong>No orders match these filters.</strong><p>Orders will appear after Alpaca reports them or BrAIker submits an approved proposal.</p></div>}</div>
      <PaginationControls page={currentPage} pageCount={pageCount} onPageChange={setPage} />
    </section>
    {historyBot && <BotHistoryModal bot={historyBot} onClose={() => setHistoryBot(null)} />}
    {decisionProposalId && <DecisionReportModal proposalId={decisionProposalId} onClose={() => setDecisionProposalId(null)} />}
  </>;
}
