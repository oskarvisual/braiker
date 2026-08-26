"use client";

import { useEffect, useState } from "react";
import { BotChat, type BotChatContextRequest } from "@/components/bot-chat";
import { BotSurvivalStatus } from "@/components/bot-survival-status";
import { useToast } from "@/components/toast";
import { botPowerState } from "@/modules/bots/power-state";
import { deriveBotSurvivalState } from "@/modules/bots/survival-state";
import { isBotChatAvailable } from "@/modules/bot-chat/availability";
import { hasOlderHistoryForTab, type BotHistoryPageAvailability, type BotHistoryTab } from "@/components/bot-history-pagination";

export type HistoryBot = { id: string; name: string };
type HistoryOrder = { id: string; action: string; symbol: string; orderType: string; quantity: string; filledQuantity: string; averagePrice: string | null; status: string; historyState: string; createdAt: string };
type AnalysisScan = { id: string; status: "COMPLETED" | "SKIPPED" | "ERROR"; reason: string; message: string; outcomes: { symbol: string; outcome: string; message: string }[]; startedAt: string; completedAt: string | null };
type AdaptiveRiskAdjustment = { id: string; level: string; reason: string; basePolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number }; effectivePolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number }; createdAt: string };
type OperatingCost = { id: string; billingMonth: string; monthlyCost?: string; allocatedAmount: string; chargedAmount: string; unpaidAmount: string; capitalBefore?: string; capitalAfter: string; createdAt: string };
type AssetPosition = { symbol: string; quantity: string; averageEntryPrice: string; marketPrice: string | null; marketValue: string | null; valuedAt: string | null };
type HistoryData = { bot: { id: string; name: string; lifeStatus: "ACTIVE" | "DEAD"; runMode: "OFF" | "SIMULATION" | "PAPER_ACTIVE"; status: string; killSwitch: boolean; adaptiveRiskEnabled: boolean; initialCapital: string; currentCapital: string; reservedCapital: string; openPositionCount: number; symbols: string[]; assets: { value: string | null; valuedAt: string | null; unpricedSymbols: string[] }; assetPositions: AssetPosition[] }; orders: HistoryOrder[]; scans: AnalysisScan[]; adaptiveRiskAdjustments: AdaptiveRiskAdjustment[]; operatingCosts: OperatingCost[]; page: number; hasMore: BotHistoryPageAvailability };

const money = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function BotHistoryModal({ bot, onClose }: { bot: HistoryBot; onClose: () => void }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BotHistoryTab>("operations");
  const [contextRequest, setContextRequest] = useState<BotChatContextRequest | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { pushToast } = useToast();

  useEffect(() => {
    let mounted = true;
    setData(null); setLoading(true); setTab("operations"); setContextRequest(null);
    void Promise.all([fetch(`/api/bots/${bot.id}/history?page=1`), fetch(`/api/bots/${bot.id}/analysis?page=1`)])
      .then(async ([historyResponse, analysisResponse]) => {
        const history = await historyResponse.json();
        const analysis = analysisResponse.ok ? await analysisResponse.json() : { scans: [] };
        if (!historyResponse.ok) throw new Error("BOT_HISTORY_UNAVAILABLE");
        if (mounted) setData({ ...history, scans: analysis.scans ?? [], operatingCosts: history.operatingCosts ?? [], page: 1, hasMore: { orders: Boolean(history.hasMore?.orders), scans: Boolean(analysis.hasMore), adjustments: Boolean(history.hasMore?.adjustments), operatingCosts: Boolean(history.hasMore?.operatingCosts) } });
      })
      .catch(() => { if (mounted) pushToast({ tone: "error", title: "Bot history could not be loaded", message: "Please try again." }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [bot.id, pushToast]);

  const history = data?.bot ?? { id: bot.id, name: bot.name, lifeStatus: "ACTIVE" as const, runMode: "OFF" as const, status: "PAUSED", killSwitch: true, adaptiveRiskEnabled: false, initialCapital: "0", currentCapital: "0", reservedCapital: "0", openPositionCount: 0, symbols: [], assets: { value: "0", valuedAt: null, unpricedSymbols: [] }, assetPositions: [] };
  const survival = deriveBotSurvivalState({ lifeStatus: history.lifeStatus, initialCapital: history.initialCapital, currentCapital: history.currentCapital, reservedCapital: history.reservedCapital, openPositionCount: history.openPositionCount, lastAnalysisAt: data?.scans[0]?.startedAt ?? null, killSwitch: history.killSwitch });
  const chatActive = isBotChatAvailable(history);
  const power = botPowerState(history.runMode);

  function askAbout(title: string, content: string, focus: BotChatContextRequest["focus"]) {
    if (!chatActive) return;
    setContextRequest({ key: `${focus.kind}-${focus.id}-${Date.now()}`, title, content, focus });
    setTab("chats");
  }

  async function loadMoreHistory() {
    if (!data || loadingMore || !hasOlderHistoryForTab(tab, data.hasMore)) return;
    setLoadingMore(true);
    try {
      const nextPage = data.page + 1;
      const [historyResponse, analysisResponse] = await Promise.all([fetch(`/api/bots/${bot.id}/history?page=${nextPage}`), fetch(`/api/bots/${bot.id}/analysis?page=${nextPage}`)]);
      const history = await historyResponse.json();
      const analysis = analysisResponse.ok ? await analysisResponse.json() : { scans: [], hasMore: false };
      if (!historyResponse.ok) throw new Error("BOT_HISTORY_PAGE_UNAVAILABLE");
      setData((current) => current ? { ...current, orders: [...current.orders, ...(history.orders ?? [])], scans: [...current.scans, ...(analysis.scans ?? [])], adaptiveRiskAdjustments: [...current.adaptiveRiskAdjustments, ...(history.adaptiveRiskAdjustments ?? [])], operatingCosts: [...current.operatingCosts, ...(history.operatingCosts ?? [])], page: nextPage, hasMore: { orders: Boolean(history.hasMore?.orders), scans: Boolean(analysis.hasMore), adjustments: Boolean(history.hasMore?.adjustments), operatingCosts: Boolean(history.hasMore?.operatingCosts) } } : current);
    } catch { pushToast({ tone: "error", title: "Older bot history could not be loaded", message: "The currently visible history is unchanged." }); }
    finally { setLoadingMore(false); }
  }

  return <div className="modalOverlay" role="presentation">
    <section className="modalCard botHistoryModal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
      <div className="modalHeading"><div><p className="eyebrow">BOT HISTORY</p><h2 id="history-modal-title">{history.name}</h2></div><div className="modalHeadingActions"><button type="button" className="iconButton" onClick={onClose} aria-label="Close">×</button></div></div>
      {loading ? <p className="muted modalLoading">Loading this bot's history…</p> : data && <>
        <section className="historySummary botDetailSummary"><div><small>Current capital</small><strong>{money(history.currentCapital)}</strong></div><div><small>Assets</small><strong>{history.assets.value === null ? "Unavailable" : money(history.assets.value)}</strong><small>{history.assets.value === null ? "Sync Alpaca" : history.assets.valuedAt ? `Valued ${dateTime(history.assets.valuedAt)}` : "No positions"}</small></div><div><small>Power</small><strong className={`botPowerValue ${power.tone}`}>{power.label}</strong></div><div><small>Life</small><strong>{history.lifeStatus === "DEAD" ? "Dead" : "Active"}</strong></div><div><small>Universe</small><strong>{history.symbols.length} symbols</strong></div><div><small>Orders</small><strong>{data.orders.length}</strong></div></section>
        <section className="survivalPanel" aria-label="Survival status"><BotSurvivalStatus state={survival} /><dl><div><dt>Liquid oxygen</dt><dd>{money(history.currentCapital)}</dd></div><div><dt>Reserved</dt><dd>{money(history.reservedCapital)}</dd></div><div><dt>Open positions</dt><dd>{history.openPositionCount}</dd></div></dl></section>
        <div className="historyTabs" role="tablist" aria-label="Bot history"><button type="button" role="tab" aria-selected={tab === "operations"} className={tab === "operations" ? "selected" : "secondaryButton"} onClick={() => setTab("operations")}>Operations ({data.orders.length})</button><button type="button" role="tab" aria-selected={tab === "analysis"} className={tab === "analysis" ? "selected" : "secondaryButton"} onClick={() => setTab("analysis")}>Analysis activity ({data.scans.length + data.operatingCosts.length})</button><button type="button" role="tab" aria-selected={tab === "assets"} className={tab === "assets" ? "selected" : "secondaryButton"} onClick={() => setTab("assets")}>Assets ({history.assetPositions.length})</button>{history.adaptiveRiskEnabled && <button type="button" role="tab" aria-selected={tab === "adaptive"} className={tab === "adaptive" ? "selected" : "secondaryButton"} onClick={() => setTab("adaptive")}>Adaptive risk ({data.adaptiveRiskAdjustments.length})</button>}<button type="button" role="tab" aria-selected={tab === "chats"} className={tab === "chats" ? "selected" : "secondaryButton"} onClick={() => setTab("chats")}>Chats</button></div>
        {tab === "chats" ? <BotChat botId={history.id} botName={history.name} active={chatActive} compact contextRequest={contextRequest} /> : tab === "assets" ? <div className="historyTable"><div className="historyRow historyHead"><span>Symbol</span><span>Quantity</span><span>Average entry</span><span>Market value</span><span>Share</span></div>{history.assetPositions.length ? history.assetPositions.map((position) => <div className="historyRow" key={position.symbol}><span><strong>{position.symbol}</strong></span><span>{position.quantity}</span><span>{money(position.averageEntryPrice)}</span><span>{position.marketValue === null ? "Unavailable — sync Alpaca" : money(position.marketValue)}</span><span>{history.assets.value && position.marketValue ? `${((Number(position.marketValue) / Number(history.assets.value)) * 100).toFixed(1)}%` : "—"}</span></div>) : <div className="historyEmpty"><strong>No bot-attributed assets.</strong><p>Assets appear here only after an attributed position and Alpaca valuation are synchronized.</p></div>}</div> : tab === "adaptive" ? <div className="analysisTable"><div className="analysisRow analysisHead"><span>When</span><span>Posture</span><span>Reason</span><span>Effective limits</span></div>{data.adaptiveRiskAdjustments.length ? data.adaptiveRiskAdjustments.map((adjustment) => <div className="analysisRow" key={adjustment.id}><span>{dateTime(adjustment.createdAt)}</span><span><strong className="historyStatus caution">{adjustment.level.toLowerCase()}</strong></span><span><strong>{adjustment.reason}</strong><small>Saved envelope: ${adjustment.basePolicy.maxPositionSize} position · ${adjustment.basePolicy.maxDailyLoss} daily · {adjustment.basePolicy.maxTradesPerDay}/day</small></span><span><strong>${adjustment.effectivePolicy.maxPositionSize} position</strong><small>${adjustment.effectivePolicy.maxDailyLoss} daily · {adjustment.effectivePolicy.maxTradesPerDay}/day</small></span></div>) : <div className="historyEmpty"><strong>No adaptive posture changes yet.</strong><p>The bot records only an actual change in effective limits; its saved envelope remains the ceiling.</p></div>}</div> : tab === "operations" ? <div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Order</span><span>Progress</span><span>Status</span><span>Average fill</span></div>{data.orders.length ? data.orders.map((order) => <div className="historyRow" key={order.id}><span>{dateTime(order.createdAt)}</span><span><strong>{order.action} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity} shares</small>{chatActive && <button type="button" className="inlineAction" onClick={() => askAbout(`Operation · ${order.action} ${order.symbol}`, `Explain this recorded operation and its decision chain: ${order.action} ${order.symbol}, ${order.orderType.toLowerCase()} order for ${order.quantity} shares, order status ${order.status}, history state ${order.historyState}.`, { kind: "ORDER", id: order.id })}>Ask in chat</button>}</span><span>{order.filledQuantity} / {order.quantity}</span><span><strong className={`historyStatus ${order.historyState.toLowerCase()}`}>{order.historyState.replaceAll("_", " ")}</strong><small>{order.status.toLowerCase()}</small></span><span>{order.averagePrice ? money(order.averagePrice) : "—"}</span></div>) : <div className="historyEmpty"><strong>No BrAIker orders for this bot yet.</strong><p>Analysis appears in the second tab even when the bot chooses not to trade.</p></div>}</div> : <div className="analysisTable"><div className="analysisRow analysisHead"><span>When</span><span>Result</span><span>What happened</span><span>Symbols</span></div>{[...data.scans.map((scan) => ({ kind: "scan" as const, at: scan.startedAt, scan })), ...data.operatingCosts.map((cost) => ({ kind: "cost" as const, at: cost.createdAt, cost }))].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).map((activity) => activity.kind === "cost" ? <div className="analysisRow" key={`cost-${activity.cost.id}`}><span>{dateTime(activity.cost.createdAt)}</span><span><strong className="historyStatus caution">cost recorded</strong></span><span><strong>Monthly virtual operating cost charged</strong><small>Allocated {money(activity.cost.allocatedAmount)} · charged {money(activity.cost.chargedAmount)}{Number(activity.cost.unpaidAmount) > 0 ? ` · unpaid ${money(activity.cost.unpaidAmount)}` : ""}</small></span><span><small>Capital after: {money(activity.cost.capitalAfter)}</small></span></div> : <div className="analysisRow" key={activity.scan.id}><span>{dateTime(activity.scan.startedAt)}</span><span><strong className={`historyStatus ${activity.scan.status.toLowerCase()}`}>{activity.scan.status.toLowerCase()}</strong></span><span><strong>{activity.scan.message}</strong><small>{activity.scan.reason.replaceAll("_", " ").toLowerCase()}</small>{chatActive && <button type="button" className="inlineAction" onClick={() => askAbout(`Activity · ${activity.scan.reason.replaceAll("_", " ")}`, `Explain this recorded analysis activity: ${activity.scan.message} Reason: ${activity.scan.reason.replaceAll("_", " ")}. Status: ${activity.scan.status}.`, { kind: "SCAN", id: activity.scan.id })}>Ask in chat</button>}</span><span>{activity.scan.outcomes.length ? activity.scan.outcomes.map((outcome) => <small className="analysisOutcome" key={`${activity.scan.id}-${outcome.symbol}`}><strong>{outcome.symbol} · {outcome.outcome.replaceAll("_", " ")}</strong>{outcome.message}</small>) : <small>No symbols were evaluated in this cycle.</small>}</span></div>) || <div className="historyEmpty"><strong>No analysis activity recorded yet.</strong><p>Operating costs and completed scans appear here.</p></div>}</div>}
        {hasOlderHistoryForTab(tab, data.hasMore) && <div className="paginationControls"><button type="button" className="secondaryButton" onClick={() => void loadMoreHistory()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older history"}</button></div>}
      </>}
    </section>
  </div>;
}
