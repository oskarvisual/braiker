"use client";

import { FormEvent, useRef, useState } from "react";
import { botControlFeedback } from "@/modules/bots/control-feedback";
import { validateBudgetAllocation } from "@/modules/capital/capital-policy";
import { nextBotWizardStep } from "@/modules/bots/wizard-flow";
import { useToast } from "@/components/toast";

const symbols = ["SPY", "QQQ", "IWM", "DIA", "XLK", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA"] as const;
type TemplateId = "GUARDIAN" | "NAVIGATOR" | "EXPLORER";
type Bot = { id: string; name: string; templateId: string; avatarSeed: string; runMode: string; status: string; lifeStatus: "ACTIVE" | "DEAD"; initialCapital: string; currentCapital: string; killSwitch: boolean; symbols: string[]; customInstructions: string; riskPolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number } };
type Wallet = { id: string; name: string; currency: string; managedCapital: string; unallocatedCapital: string; bots: Bot[] };
type Template = { id: TemplateId; name: string; description: string; avatar: string; riskPolicy: { maxPositionSize: string; maxPortfolioExposure: string; maxDailyLoss: string; maxWeeklyLoss: string; maxTradesPerDay: number } };
type EditorModal = { mode: "create" } | { mode: "clone"; source: Bot } | { mode: "edit"; bot: Bot; walletId: string } | null;
type CapitalModal = { bot: Bot; walletId: string } | null;
type HistoryOrder = { id: string; action: string; symbol: string; orderType: string; quantity: string; filledQuantity: string; averagePrice: string | null; status: string; historyState: string; createdAt: string };
type HistoryData = { bot: Pick<Bot, "id" | "name" | "templateId" | "avatarSeed" | "lifeStatus" | "runMode" | "killSwitch" | "currentCapital" | "initialCapital" | "symbols">; orders: HistoryOrder[] };

const money = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function capitalFeedback(code: string | undefined, direction: "ADD" | "WITHDRAW", walletName: string, availableCapital: string) {
  if (code === "INSUFFICIENT_UNALLOCATED_CAPITAL") return `${walletName} has ${money(availableCapital)} available to assign.`;
  if (code === "WITHDRAWAL_MUST_LEAVE_CAPITAL") return "A live bot must retain capital. Turn it off and delete it to return its full current capital to the wallet.";
  if (code === "CAPITAL_RESERVED_BY_OPEN_ORDER") return "This bot has capital reserved by an open order. Wait for that order to finish before moving capital.";
  if (code === "DEAD_BOT_HISTORY_IS_IMMUTABLE") return "Dead bots are retained as history only. Clone it to create a new bot with a new budget.";
  return direction === "ADD" ? "We could not add capital to this bot. Please try again." : "We could not withdraw capital from this bot. Please try again.";
}

export function BotSetup({ initialWallets, templates }: { initialWallets: Wallet[]; templates: Template[] }) {
  const [wallets, setWallets] = useState(initialWallets);
  const [editorModal, setEditorModal] = useState<EditorModal>(null);
  const [capitalModal, setCapitalModal] = useState<CapitalModal>(null);
  const [historyBot, setHistoryBot] = useState<Bot | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [walletId, setWalletId] = useState(initialWallets[0]?.id ?? "");
  const [templateId, setTemplateId] = useState<TemplateId>("NAVIGATOR");
  const [botName, setBotName] = useState("");
  const [budget, setBudget] = useState("50");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["SPY", "QQQ", "AAPL"]);
  const [customInstructions, setCustomInstructions] = useState("");
  const [maxPositionSize, setMaxPositionSize] = useState("10");
  const [maxDailyLoss, setMaxDailyLoss] = useState("2");
  const [maxTradesPerDay, setMaxTradesPerDay] = useState("4");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [controllingBotId, setControllingBotId] = useState<string | null>(null);
  const [capitalDirection, setCapitalDirection] = useState<"ADD" | "WITHDRAW">("ADD");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [savingCapital, setSavingCapital] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { pushToast } = useToast();
  const activeTemplate = templates.find((template) => template.id === templateId)!;
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
  const isNewBot = editorModal?.mode === "create" || editorModal?.mode === "clone";
  const budgetError = isNewBot && selectedWallet ? validateBudgetAllocation({ unallocatedCapital: selectedWallet.unallocatedCapital, requestedBudget: budget }) : null;

  function setProfileDefaults(id: TemplateId) { const profile = templates.find((template) => template.id === id)!.riskPolicy; setTemplateId(id); setMaxPositionSize(profile.maxPositionSize); setMaxDailyLoss(profile.maxDailyLoss); setMaxTradesPerDay(String(profile.maxTradesPerDay)); }
  function populateEditor(bot: Bot, targetWalletId: string) { setWalletId(targetWalletId); setTemplateId(bot.templateId as TemplateId); setBotName(bot.name); setCustomInstructions(bot.customInstructions); setMaxPositionSize(bot.riskPolicy.maxPositionSize); setMaxDailyLoss(bot.riskPolicy.maxDailyLoss); setMaxTradesPerDay(String(bot.riskPolicy.maxTradesPerDay)); setSelectedSymbols(bot.symbols); setConfirmDelete(false); }
  function openCreate() { setWalletId(wallets[0]?.id ?? ""); setProfileDefaults("NAVIGATOR"); setBotName(""); setBudget("50"); setCustomInstructions(""); setSelectedSymbols(["SPY", "QQQ", "AAPL"]); setStep(1); setConfirmDelete(false); setEditorModal({ mode: "create" }); }
  function openEdit(bot: Bot, targetWalletId: string) { if (bot.lifeStatus === "DEAD") return; populateEditor(bot, targetWalletId); setBudget(bot.currentCapital); setStep(1); setEditorModal({ mode: "edit", bot, walletId: targetWalletId }); }
  function openClone(source: Bot, sourceWalletId: string) { populateEditor(source, sourceWalletId); setBotName(`${source.name} copy`); setBudget(Number(source.currentCapital) > 0 ? source.currentCapital : "50"); setStep(2); setEditorModal({ mode: "clone", source }); }
  function closeEditor() { setEditorModal(null); setConfirmDelete(false); }
  function closeCapital() { setCapitalModal(null); setCapitalAmount(""); setCapitalDirection("ADD"); }
  function toggleSymbol(symbol: string) { setSelectedSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]); }

  async function save() {
    if (!editorModal || !formRef.current?.reportValidity()) return;
    if (isNewBot && budgetError) { pushToast({ tone: "error", ...botControlFeedback(budgetError, { requestedBotName: botName || "New bot", walletName: selectedWallet?.name, availableCapital: selectedWallet?.unallocatedCapital }) }); return; }
    const create = isNewBot;
    const customization = { customInstructions, riskLimits: { maxPositionSize, maxDailyLoss, maxTradesPerDay: Number(maxTradesPerDay) } };
    const response = await fetch(create ? "/api/bots" : `/api/bots/${editorModal.bot.id}`, { method: create ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(create ? { walletId, name: botName, templateId, budget, symbols: selectedSymbols, sourceBotId: editorModal.mode === "clone" ? editorModal.source.id : undefined, ...customization } : { name: botName, templateId, symbols: selectedSymbols, ...customization }) });
    const body = await response.json();
    if (!response.ok) { pushToast({ tone: "error", ...botControlFeedback(body.error, { requestedBotName: botName || "New bot", walletName: selectedWallet?.name, availableCapital: selectedWallet?.unallocatedCapital }) }); return; }
    if (create) setWallets((current) => current.map((wallet) => wallet.id === walletId ? { ...wallet, unallocatedCapital: body.walletUnallocatedCapital, bots: [...wallet.bots, { ...body, symbols: selectedSymbols, customInstructions, riskPolicy: body.riskPolicy }] } : wallet));
    else setWallets((current) => current.map((wallet) => ({ ...wallet, bots: wallet.bots.map((bot) => bot.id === editorModal.bot.id ? { ...bot, ...body, symbols: selectedSymbols, customInstructions, riskPolicy: body.riskPolicy } : bot) })));
    closeEditor();
  }
  function preventImplicitSave(event: FormEvent<HTMLFormElement>) { event.preventDefault(); }
  async function remove() {
    if (editorModal?.mode !== "edit") return;
    const response = await fetch(`/api/bots/${editorModal.bot.id}`, { method: "DELETE" });
    if (!response.ok) { await response.json(); pushToast({ tone: "error", title: "We could not delete this bot", message: "Turn the bot off first, then try again." }); return; }
    setWallets((current) => current.map((wallet) => wallet.id === editorModal.walletId ? { ...wallet, unallocatedCapital: String(Number(wallet.unallocatedCapital) + Number(editorModal.bot.currentCapital)), bots: wallet.bots.filter((bot) => bot.id !== editorModal.bot.id) } : wallet)); closeEditor();
  }
  async function setPower(bot: Bot, enabled: boolean) {
    if (bot.lifeStatus === "DEAD") return;
    setControllingBotId(bot.id);
    const response = await fetch(`/api/bots/${bot.id}/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: enabled ? "TURN_ON" : "TURN_OFF" }) });
    const body = await response.json(); setControllingBotId(null);
    if (!response.ok) { pushToast({ tone: "error", ...botControlFeedback(body.error, { requestedBotName: bot.name }) }); return; }
    setWallets((current) => current.map((wallet) => ({ ...wallet, bots: wallet.bots.map((item) => item.id === bot.id ? { ...item, runMode: body.runMode, status: body.status, killSwitch: body.killSwitch } : item) })));
  }
  async function saveCapital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!capitalModal) return;
    const wallet = wallets.find((item) => item.id === capitalModal.walletId)!;
    setSavingCapital(true);
    const response = await fetch(`/api/bots/${capitalModal.bot.id}/capital`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: capitalDirection, amount: capitalAmount }) });
    const body = await response.json(); setSavingCapital(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Capital was not moved", message: capitalFeedback(body.error, capitalDirection, wallet.name, wallet.unallocatedCapital) }); return; }
    setWallets((current) => current.map((item) => item.id === wallet.id ? { ...item, unallocatedCapital: body.walletUnallocatedCapital, bots: item.bots.map((bot) => bot.id === capitalModal.bot.id ? { ...bot, currentCapital: body.currentCapital, initialCapital: body.initialCapital } : bot) } : item));
    closeCapital(); pushToast({ tone: "success", title: capitalDirection === "ADD" ? "Capital added to bot" : "Capital returned to wallet" });
  }
  async function openHistory(bot: Bot) {
    setHistoryBot(bot); setHistoryData(null); setHistoryLoading(true);
    const response = await fetch(`/api/bots/${bot.id}/history`); const body = await response.json(); setHistoryLoading(false);
    if (!response.ok) { setHistoryBot(null); pushToast({ tone: "error", title: "Bot history could not be loaded", message: "Please try again." }); return; }
    setHistoryData(body);
  }

  return <>
    <header><div><p className="eyebrow">BOT CONFIGURATION</p><h1>Bots</h1></div><button className="headerAction" onClick={openCreate} disabled={!wallets.length}>Add bot</button></header>
    <section className="panel simpleTablePanel"><div className="userTable botTable"><div className="userRow userHead"><span>Bot</span><span>Capital</span><span>Risk limits</span><span>Universe</span><span>Power</span><span>Actions</span></div>{wallets.flatMap((wallet) => wallet.bots.map((bot) => { const isOn = bot.runMode === "PAPER_ACTIVE" && !bot.killSwitch; const isDead = bot.lifeStatus === "DEAD"; return <div className="userRow" key={bot.id}><span className="botNameCell"><i className={`avatar ${bot.avatarSeed}`}>{bot.name.slice(0, 1).toUpperCase()}</i><strong><button type="button" className="botHistoryButton" onClick={() => void openHistory(bot)}>{bot.name}</button><small>{bot.templateId} · {wallet.name}</small></strong></span><span><strong>{money(bot.currentCapital)}</strong><small>{isDead ? "Dead — history only" : "Available to this bot"}</small>{!isDead && <button type="button" className="inlineAction" onClick={() => { setCapitalModal({ bot, walletId: wallet.id }); setCapitalAmount(""); }}>Manage</button>}</span><span><strong>${bot.riskPolicy.maxPositionSize}/position</strong><small>${bot.riskPolicy.maxDailyLoss} daily loss · {bot.riskPolicy.maxTradesPerDay}/day</small></span><span>{bot.symbols.join(" · ")}</span><span>{isDead ? <small className="deadHistory">History only</small> : <label className="powerSwitch"><input type="checkbox" checked={isOn} disabled={controllingBotId === bot.id} onChange={(event) => setPower(bot, event.target.checked)} aria-label={`Turn ${bot.name} ${isOn ? "off" : "on"}`} /><i aria-hidden="true" /><strong>{isOn ? "ON" : "OFF"}</strong></label>}</span><span className="botActions"><button className="iconButton" title={`View ${bot.name} history`} onClick={() => void openHistory(bot)} aria-label={`View ${bot.name} history`}>◉</button>{!isDead && <button className="iconButton" title={`Edit ${bot.name}`} onClick={() => openEdit(bot, wallet.id)} aria-label={`Edit ${bot.name}`}>✎</button>}</span></div>; }))}</div>{wallets.every((wallet) => wallet.bots.length === 0) && <p className="muted">No bots created. Add the first member of your team.</p>}</section>
    {editorModal && <div className="modalOverlay" role="presentation"><section className="modalCard botModal" role="dialog" aria-modal="true" aria-labelledby="bot-modal-title"><div className="modalHeading"><div><p className="eyebrow">{editorModal.mode === "create" ? `NEW BOT · STEP ${step}/3` : editorModal.mode === "clone" ? `CLONE BOT · STEP ${step}/3` : `EDIT BOT · STEP ${step}/3`}</p><h2 id="bot-modal-title">{editorModal.mode === "create" ? "Add bot" : editorModal.mode === "clone" ? `Clone ${editorModal.source.name}` : editorModal.bot.name}</h2></div><div className="modalHeadingActions">{editorModal.mode === "edit" && <button type="button" className="secondaryButton" onClick={() => openClone(editorModal.bot, editorModal.walletId)}>Clone</button>}<button type="button" className="iconButton" onClick={closeEditor} aria-label="Close">×</button></div></div><form ref={formRef} onSubmit={preventImplicitSave}>{step === 1 && <div className="templateCards">{templates.map((template) => <button type="button" key={template.id} className={`templateCard ${template.id === templateId ? "selected" : ""}`} onClick={() => setProfileDefaults(template.id)}><span className={`avatar ${template.avatar}`}>{template.name.slice(0, 1)}</span><strong>{template.name}</strong><small>{template.description}</small><em>Profile cap: ${template.riskPolicy.maxPositionSize}/position · {template.riskPolicy.maxTradesPerDay} trades/day</em></button>)}</div>}{step === 2 && <div className="formColumns"><label>Bot name<input value={botName} onChange={(event) => setBotName(event.target.value)} minLength={2} required /></label>{isNewBot ? <><label>Wallet<select value={walletId} onChange={(event) => setWalletId(event.target.value)}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} · ${wallet.unallocatedCapital} available</option>)}</select></label><label>Budget (USD)<input type="number" min="0.01" step="0.01" max={selectedWallet?.unallocatedCapital} value={budget} onChange={(event) => setBudget(event.target.value)} required /><small className={budgetError ? "fieldError" : "fieldHelp"}>{budgetError ? "No unallocated capital is available in this wallet." : `$${selectedWallet?.unallocatedCapital ?? "0"} available for this new bot.`}</small></label></> : <label>Current capital<input value={money(budget)} disabled /></label>}<label className="fullField">Additional instructions<textarea value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} maxLength={1200} placeholder="Example: prioritize liquid ETFs and explain every decision in plain language." /><small>Guidance for this bot only. It cannot override mandatory survival rules or risk checks.</small></label></div>}{step === 3 && <><div className="symbolPicker">{symbols.map((symbol) => <label key={symbol}><input type="checkbox" checked={selectedSymbols.includes(symbol)} onChange={() => toggleSymbol(symbol)} />{symbol}</label>)}</div><small className="muted">Choose the symbols this bot may analyze and trade.</small><fieldset className="riskLimits"><legend>Bot risk limits <small>May be lower than the {activeTemplate.name} profile, never higher.</small></legend><label>Max position (USD)<input type="number" min="0.01" step="0.01" max={activeTemplate.riskPolicy.maxPositionSize} value={maxPositionSize} onChange={(event) => setMaxPositionSize(event.target.value)} required /></label><label>Max daily loss (USD)<input type="number" min="0.01" step="0.01" max={activeTemplate.riskPolicy.maxDailyLoss} value={maxDailyLoss} onChange={(event) => setMaxDailyLoss(event.target.value)} required /></label><label>Max trades / day<input type="number" min="1" step="1" max={activeTemplate.riskPolicy.maxTradesPerDay} value={maxTradesPerDay} onChange={(event) => setMaxTradesPerDay(event.target.value)} required /></label></fieldset></>}<div className="modalActions">{step > 1 && <button type="button" className="secondaryButton" onClick={() => setStep(step - 1)}>Back</button>}{step < 3 ? <button type="button" disabled={step === 2 && (!botName || Boolean(budgetError))} onClick={() => setStep(nextBotWizardStep(step))}>Continue</button> : <button type="button" disabled={!selectedSymbols.length || Boolean(budgetError)} onClick={() => void save()}>{isNewBot ? `Create ${activeTemplate.name}` : "Save bot"}</button>}</div></form>{editorModal.mode === "edit" && <div className="dangerZone">{confirmDelete ? <><p>Delete {editorModal.bot.name}? Its current capital returns to the wallet.</p><div><button type="button" className="secondaryButton" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="dangerButton" onClick={remove}>Confirm delete</button></div></> : <button type="button" className="dangerButton" onClick={() => setConfirmDelete(true)}>Delete bot</button>}</div>}</section></div>}
    {capitalModal && <div className="modalOverlay" role="presentation"><section className="modalCard capitalModal" role="dialog" aria-modal="true" aria-labelledby="capital-modal-title"><div className="modalHeading"><div><p className="eyebrow">BOT CAPITAL</p><h2 id="capital-modal-title">Manage {capitalModal.bot.name}</h2></div><button type="button" className="iconButton" onClick={closeCapital} aria-label="Close">×</button></div><form onSubmit={saveCapital}><div className="capitalSnapshot"><span><small>Bot capital</small><strong>{money(capitalModal.bot.currentCapital)}</strong></span><span><small>Wallet available</small><strong>{money(wallets.find((wallet) => wallet.id === capitalModal.walletId)?.unallocatedCapital ?? "0")}</strong></span></div><div className="capitalDirection"><button type="button" className={capitalDirection === "ADD" ? "selected" : "secondaryButton"} onClick={() => setCapitalDirection("ADD")}>Add capital</button><button type="button" className={capitalDirection === "WITHDRAW" ? "selected" : "secondaryButton"} onClick={() => setCapitalDirection("WITHDRAW")}>Return capital</button></div><label>Amount (USD)<input type="number" min="0.01" step="0.01" max={capitalDirection === "WITHDRAW" ? capitalModal.bot.currentCapital : wallets.find((wallet) => wallet.id === capitalModal.walletId)?.unallocatedCapital} value={capitalAmount} onChange={(event) => setCapitalAmount(event.target.value)} required /></label><p className="muted">{capitalDirection === "ADD" ? "This moves currently unallocated wallet capital to this bot." : "This returns part of the bot's current capital to the wallet. To return all capital, turn the bot off and delete it."}</p><button type="submit" disabled={savingCapital}>{savingCapital ? "Saving…" : capitalDirection === "ADD" ? "Add capital" : "Return capital"}</button></form></section></div>}
    {historyBot && <div className="modalOverlay" role="presentation"><section className="modalCard botHistoryModal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title"><div className="modalHeading"><div><p className="eyebrow">BOT HISTORY</p><h2 id="history-modal-title">{historyBot.name}</h2></div><div className="modalHeadingActions"><button type="button" className="secondaryButton" onClick={() => { const wallet = wallets.find((item) => item.bots.some((bot) => bot.id === historyBot.id)); if (wallet) { setHistoryBot(null); openClone(historyBot, wallet.id); } }}>Clone</button><button type="button" className="iconButton" onClick={() => setHistoryBot(null)} aria-label="Close">×</button></div></div>{historyLoading ? <p className="muted modalLoading">Loading this bot's order history…</p> : historyData && <><section className="historySummary botDetailSummary"><div><small>Current capital</small><strong>{money(historyData.bot.currentCapital)}</strong></div><div><small>Life</small><strong>{historyData.bot.lifeStatus === "DEAD" ? "Dead" : "Active"}</strong></div><div><small>Universe</small><strong>{historyData.bot.symbols.length} symbols</strong></div><div><small>Orders</small><strong>{historyData.orders.length}</strong></div></section><div className="historyTable"><div className="historyRow historyHead"><span>When</span><span>Order</span><span>Progress</span><span>Status</span><span>Average fill</span></div>{historyData.orders.length ? historyData.orders.map((order) => <div className="historyRow" key={order.id}><span>{dateTime(order.createdAt)}</span><span><strong>{order.action} {order.symbol}</strong><small>{order.orderType.toLowerCase()} · {order.quantity} shares</small></span><span>{order.filledQuantity} / {order.quantity}</span><span><strong className={`historyStatus ${order.historyState.toLowerCase()}`}>{order.historyState.replaceAll("_", " ")}</strong><small>{order.status.toLowerCase()}</small></span><span>{order.averagePrice ? money(order.averagePrice) : "—"}</span></div>) : <div className="historyEmpty"><strong>No BrAIker orders for this bot yet.</strong><p>Turning a bot on changes its state; it does not yet run an autonomous trading strategy.</p></div>}</div></>}</section></div>}
  </>;
}
