"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { BotSurvivalStatus } from "@/components/bot-survival-status";
import { BotChat } from "@/components/bot-chat";
import { deriveBotSurvivalState } from "@/modules/bots/survival-state";

export type HistoryBot = { id: string; name: string };

type HistoryOrder = { id: string; action: string; symbol: string; orderType: string; quantity: string; filledQuantity: string; averagePrice: string | null; status: string; historyState: string; createdAt: string };
type AnalysisScan = { id: string; status: "COMPLETED" | "SKIPPED" | "ERROR"; reason: string; message: string; outcomes: { symbol: string; outcome: string; message: string }[]; startedAt: string; completedAt: string | null };
type HistoryData = { bot: { id: string; name: string; lifeStatus: "ACTIVE" | "DEAD"; runMode: "OFF" | "SIMULATION" | "PAPER_ACTIVE"; killSwitch: boolean; initialCapital: string; currentCapital: string; reservedCapital: string; openPositionCount: number; symbols: string[] }; orders: HistoryOrder[]; scans: AnalysisScan[] };

const money = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

/** Shared bot detail view for every place that links an order back to its bot. */
export function BotHistoryModal({ bot, onClose }: { bot: HistoryBot; onClose: () => void }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"operations" | "analysis" | "chats">("operations");
  const { pushToast } = useToast();

  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(true);
    setTab("operations");
    void Promise.all([fetch(`/api/bots/${bot.id}/history`), fetch(`/api/bots/${bot.id}/analysis`)])
      .then(async ([historyResponse, analysisResponse]) => {
        const history = await historyResponse.json();
        const analysis = analysisResponse.ok ? await analysisResponse.json() : { scans: [] };
        if (!historyResponse.ok) throw new Error("BOT_HISTORY_UNAVAILABLE");
        if (active) setData({ ...history, scans: analysis.scans ?? [] });
      })
      .catch(() => {
        if (active) pushToast({ tone: "error", title: "Bot history could not be loaded", message: "Please try again." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bot.id, pushToast]);

  const history = data?.bot ?? { id: bot.id, name: bot.name, lifeStatus: "ACTIVE" as const, runMode: "OFF" as const, killSwitch: true, initialCapital: "0", currentCapital: "0", reservedCapital: "0", openPositionCount: 0, symbols: [] };
  const survival = deriveBotSurvivalState({ lifeStatus: history.lifeStatus, initialCapital: history.initialCapital, currentCapital: history.currentCapital, reservedCapital: history.reservedCapital, openPositionCount: history.openPositionCount, lastAnalysisAt: data?.scans[0]?.startedAt ?? null });

  const chatActive = history.runMode === "PAPER_ACTIVE" && history.lifeStatus === "ACTIVE" && !history.killSwitch;
  return <div className="modalOverlay" role="presentation"><section className="modalCard botHistoryModal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title"><div className="modalHeading"><div><p className="eyebrow">BOT HISTORY</p><h2 id="history-modal-title">{history.name}</h2></div><div className="modalHeadingActions"><button type="button" className="iconButton" onClick={onClose} aria-label="Close">×</button></div></div>{loading ? <p className="muted modalLoading">Loading this bot's history…</p> : data && <><section className="historySummary botDetailSummary"><div><small>Current capital</small><strong>{money(history.currentCapital)}</strong></div><div><small>Life</small><strong>{history.lifeStatus === "DEAD" ? "Dead" : "Active"}</strong></div><div><small>Universe</small><strong>{history.symbols.length} symbols</strong></div><div><small>Orders</small><strong>{data.orders.length}</strong></div></section><section className="survivalPanel" aria-label="Survival status"><BotSurvivalStatus state={survival} /><div><strong>Survival is informational</strong><p>The bot's permanent survival rules, risk limits, Kill Switch, and trading controls remain unchanged.</p></div><dl><div><dt>Liquid oxygen</dt><dd>{money(history.currentCapital)}</dd></div><div><dt>Reserved</dt><dd>{money(history.reservedCapital)}</dd></div><div><dt>Open positions</dt><dd>{history.openPositionCount}</dd></div></dl></section><div className="historyTabs" role="tablist" aria-label="Bot history"><button type="button" role="tab" aria-selected={tab === "operations"} className={tab === "operations" ? "selected" : "secondaryButton"} onClick={() => setTab("operations")}>Operations ({data.orders.length})</button><button type="button" role="tab" aria-selected={tab === "analysis"} className={tab === "analysis" ? "selected" : "secondaryButton"} onClick={() => setTab("analysis")}>Analysis activity ({data.scans.length})</button><button type="button" role="tab" aria-selected={tab === "chats"} className={tab === "chats" ? "selected" : "secondaryButton"} onClick={() => setTab("chats")}>Chats</button></div>{tab === "chats" ? <BotChat botId={history.id} botName={history.name} active={chatActive} compact /> : tab === "operations" ? <div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Order</span><span>Progress</span><span>Status</span><span>Average fill</span></div>{data.orders.length ? data.orders.map((order) => <div className="historyRow" key={order.id}><span>{dateTime(order.createdAt)}</span><span><strong>{order.action} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity} shares</small></span><span>{order.filledQuantity} / {order.quantity}</span><span><strong className={`historyStatus ${order.historyState.toLowerCase()}`}>{order.historyState.replaceAll("_", " ")}</strong><small>{order.status.toLowerCase()}</small></span><span>{order.averagePrice ? money(order.averagePrice) : "—"}</span></div>) : <div className="historyEmpty"><strong>No BrAIker orders for this bot yet.</strong><p>Analysis appears in the second tab even when the bot chooses not to trade.</p></div>}</div> : <div className="analysisTable"><div className="analysisRow analysisHead"><span>When</span><span>Result</span><span>What happened</span><span>Symbols</span></div>{data.scans.length ? data.scans.map((scan) => <div className="analysisRow" key={scan.id}><span>{dateTime(scan.startedAt)}</span><span><strong className={`historyStatus ${scan.status.toLowerCase()}`}>{scan.status.toLowerCase()}</strong></span><span><strong>{scan.message}</strong><small>{scan.reason.replaceAll("_", " ").toLowerCase()}</small></span><span>{scan.outcomes.length ? scan.outcomes.map((outcome) => <small className="analysisOutcome" key={`${scan.id}-${outcome.symbol}`}><strong>{outcome.symbol} · {outcome.outcome.replaceAll("_", " ")}</strong>{outcome.message}</small>) : <small>No symbols were evaluated in this cycle.</small>}</span></div>) : <div className="historyEmpty"><strong>No analysis cycles recorded yet.</strong><p>Turn the bot on while the worker is running. Its first completed scan will appear here, even if it does not place an order.</p></div>}</div>}</>}</section></div>;
}
