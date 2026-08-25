"use client";

import { FormEvent, useRef, useState } from "react";
import { botControlFeedback } from "@/modules/bots/control-feedback";
import { validateBudgetAllocation } from "@/modules/capital/capital-policy";
import { nextBotWizardStep } from "@/modules/bots/wizard-flow";
import { useToast } from "@/components/toast";
import { selectedSymbolSummary } from "@/components/symbol-selector-state";
import { BotHistoryModal } from "@/components/bot-history-modal";
import { BotSurvivalStatus } from "@/components/bot-survival-status";
import { deriveBotSurvivalState } from "@/modules/bots/survival-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/modules/pagination/page";
import styles from "./bot-setup.module.css";

type TemplateId = "GUARDIAN" | "NAVIGATOR" | "EXPLORER";
type Bot = { id: string; name: string; templateId: string; avatarSeed: string; runMode: string; status: string; lifeStatus: "ACTIVE" | "DEAD"; initialCapital: string; currentCapital: string; reservedCapital: string; openPositionCount: number; killSwitch: boolean; adaptiveRiskEnabled: boolean; symbols: string[]; customInstructions: string; riskPolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number }; assets: { value: string | null; valuedAt: string | null; unpricedSymbols: string[] }; lastAnalysis: { startedAt: string; status: string; message: string } | null };
type Wallet = { id: string; name: string; currency: string; managedCapital: string; unallocatedCapital: string; bots: Bot[] };
type Template = { id: TemplateId; name: string; description: string; avatar: string; riskPolicy: { maxPositionSize: string; maxPortfolioExposure: string; maxDailyLoss: string; maxWeeklyLoss: string; maxTradesPerDay: number } };
type EditorModal = { mode: "create" } | { mode: "clone"; source: Bot } | { mode: "edit"; bot: Bot; walletId: string } | null;
type CapitalModal = { bot: Bot; walletId: string } | null;

const money = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function capitalFeedback(code: string | undefined, direction: "ADD" | "WITHDRAW", walletName: string, availableCapital: string) {
  if (code === "INSUFFICIENT_UNALLOCATED_CAPITAL") return `${walletName} has ${money(availableCapital)} available to assign.`;
  if (code === "WITHDRAWAL_MUST_LEAVE_CAPITAL") return "A live bot must retain capital. Turn it off and delete it to return its full current capital to the wallet.";
  if (code === "CAPITAL_RESERVED_BY_OPEN_ORDER") return "This bot has capital reserved by an open order. Wait for that order to finish before moving capital.";
  if (code === "DEAD_BOT_HISTORY_IS_IMMUTABLE") return "Dead bots are retained as history only. Clone it to create a new bot with a new budget.";
  return direction === "ADD" ? "We could not add capital to this bot. Please try again." : "We could not withdraw capital from this bot. Please try again.";
}

export function BotSetup({ initialWallets, templates, symbols }: { initialWallets: Wallet[]; templates: Template[]; symbols: string[] }) {
  const [wallets, setWallets] = useState(initialWallets);
  const [editorModal, setEditorModal] = useState<EditorModal>(null);
  const [capitalModal, setCapitalModal] = useState<CapitalModal>(null);
  const [historyBot, setHistoryBot] = useState<Bot | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPacket, setImportPacket] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWalletId, setImportWalletId] = useState(initialWallets[0]?.id ?? "");
  const [importBudget, setImportBudget] = useState("50");
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState(1);
  const [walletId, setWalletId] = useState(initialWallets[0]?.id ?? "");
  const [templateId, setTemplateId] = useState<TemplateId>("NAVIGATOR");
  const [botName, setBotName] = useState("");
  const [budget, setBudget] = useState("50");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(symbols.filter((symbol) => ["SPY", "QQQ", "AAPL"].includes(symbol)));
  const [customInstructions, setCustomInstructions] = useState("");
  const [maxPositionSize, setMaxPositionSize] = useState("10");
  const [maxDailyLoss, setMaxDailyLoss] = useState("2");
  const [maxTradesPerDay, setMaxTradesPerDay] = useState("4");
  const [adaptiveRiskEnabled, setAdaptiveRiskEnabled] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [controllingBotId, setControllingBotId] = useState<string | null>(null);
  const [capitalDirection, setCapitalDirection] = useState<"ADD" | "WITHDRAW">("ADD");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [savingCapital, setSavingCapital] = useState(false);
  const [botPage, setBotPage] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);
  const { pushToast } = useToast();
  const activeTemplate = templates.find((template) => template.id === templateId)!;
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
  const importWallet = wallets.find((wallet) => wallet.id === importWalletId);
  const isNewBot = editorModal?.mode === "create" || editorModal?.mode === "clone";
  const budgetError = isNewBot && selectedWallet ? validateBudgetAllocation({ unallocatedCapital: selectedWallet.unallocatedCapital, requestedBudget: budget }) : null;
  const botRows = wallets.flatMap((wallet) => wallet.bots.map((bot) => ({ bot, wallet })));
  const botPageCount = Math.max(1, Math.ceil(botRows.length / PAGE_SIZE));
  const currentBotPage = Math.min(botPage, botPageCount);
  const visibleBotRows = botRows.slice((currentBotPage - 1) * PAGE_SIZE, currentBotPage * PAGE_SIZE);

  function setProfileDefaults(id: TemplateId) { const profile = templates.find((template) => template.id === id)!.riskPolicy; setTemplateId(id); setMaxPositionSize(profile.maxPositionSize); setMaxDailyLoss(profile.maxDailyLoss); setMaxTradesPerDay(String(profile.maxTradesPerDay)); }
  function populateEditor(bot: Bot, targetWalletId: string) { setWalletId(targetWalletId); setTemplateId(bot.templateId as TemplateId); setBotName(bot.name); setCustomInstructions(bot.customInstructions); setMaxPositionSize(bot.riskPolicy.maxPositionSize); setMaxDailyLoss(bot.riskPolicy.maxDailyLoss); setMaxTradesPerDay(String(bot.riskPolicy.maxTradesPerDay)); setAdaptiveRiskEnabled(bot.adaptiveRiskEnabled); setSelectedSymbols(bot.symbols); setConfirmDelete(false); }
  function openCreate() { setWalletId(wallets[0]?.id ?? ""); setProfileDefaults("NAVIGATOR"); setBotName(""); setBudget("50"); setCustomInstructions(""); setAdaptiveRiskEnabled(false); setSelectedSymbols(symbols.filter((symbol) => ["SPY", "QQQ", "AAPL"].includes(symbol))); setStep(1); setConfirmDelete(false); setEditorModal({ mode: "create" }); }
  function openEdit(bot: Bot, targetWalletId: string) { if (bot.lifeStatus === "DEAD") return; populateEditor(bot, targetWalletId); setBudget(bot.currentCapital); setStep(1); setEditorModal({ mode: "edit", bot, walletId: targetWalletId }); }
  function openClone(source: Bot, sourceWalletId: string) { populateEditor(source, sourceWalletId); setBotName(`${source.name} copy`); setBudget(Number(source.currentCapital) > 0 ? source.currentCapital : "50"); setStep(2); setEditorModal({ mode: "clone", source }); }
  function closeEditor() { setEditorModal(null); setConfirmDelete(false); }
  function closeCapital() { setCapitalModal(null); setCapitalAmount(""); setCapitalDirection("ADD"); }
  function toggleSymbol(symbol: string) { setSelectedSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]); }

  async function save() {
    if (!editorModal || !formRef.current?.reportValidity()) return;
    if (isNewBot && budgetError) { pushToast({ tone: "error", ...botControlFeedback(budgetError, { requestedBotName: botName || "New bot", walletName: selectedWallet?.name, availableCapital: selectedWallet?.unallocatedCapital }) }); return; }
    const create = isNewBot;
    const customization = { customInstructions, adaptiveRiskEnabled, riskLimits: { maxPositionSize, maxDailyLoss, maxTradesPerDay: Number(maxTradesPerDay) } };
    const response = await fetch(create ? "/api/bots" : `/api/bots/${editorModal.bot.id}`, { method: create ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(create ? { walletId, name: botName, templateId, budget, symbols: selectedSymbols, sourceBotId: editorModal.mode === "clone" ? editorModal.source.id : undefined, ...customization } : { name: botName, templateId, symbols: selectedSymbols, ...customization }) });
    const body = await response.json();
    if (!response.ok) { pushToast({ tone: "error", ...botControlFeedback(body.error, { requestedBotName: botName || "New bot", walletName: selectedWallet?.name, availableCapital: selectedWallet?.unallocatedCapital }) }); return; }
    if (create) setWallets((current) => current.map((wallet) => wallet.id === walletId ? { ...wallet, unallocatedCapital: body.walletUnallocatedCapital, bots: [...wallet.bots, { ...body, reservedCapital: "0", openPositionCount: 0, symbols: selectedSymbols, customInstructions, adaptiveRiskEnabled: body.adaptiveRiskEnabled, riskPolicy: body.riskPolicy, lastAnalysis: null }] } : wallet));
    else setWallets((current) => current.map((wallet) => ({ ...wallet, bots: wallet.bots.map((bot) => bot.id === editorModal.bot.id ? { ...bot, ...body, symbols: selectedSymbols, customInstructions, adaptiveRiskEnabled: body.adaptiveRiskEnabled, riskPolicy: body.riskPolicy } : bot) })));
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
  function openHistory(bot: Bot) { setHistoryBot(bot); }
  function openImport() { setImportPacket(null); setImportError(null); setImportWalletId(wallets[0]?.id ?? ""); setImportBudget("50"); setImportOpen(true); }
  async function readImportFile(file: File | undefined) { if (!file) return; try { const parsed = JSON.parse(await file.text()); if (parsed?.kind !== "braiker.bot.config" || parsed?.schemaVersion !== 1 || !parsed?.contentHash || !parsed?.bot?.name || !Array.isArray(parsed?.bot?.symbols) || !parsed?.bot?.riskLimits || !Array.isArray(parsed?.bot?.learnedInstructions)) throw new Error(); setImportPacket(parsed); setImportError(null); } catch { setImportPacket(null); setImportError("This file is not a complete BrAIker bot configuration package."); } }
  async function importBot() { if (!importPacket || !importWallet) return; const budgetError = validateBudgetAllocation({ unallocatedCapital: importWallet.unallocatedCapital, requestedBudget: importBudget }); if (budgetError) { setImportError("The selected wallet does not have enough unallocated capital for this budget."); return; } setImporting(true); const response = await fetch("/api/bots/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletId: importWalletId, budget: importBudget, packet: importPacket }) }); const body = await response.json(); setImporting(false); if (!response.ok) { setImportError(body.error === "BOT_IMPORT_DUPLICATE_PACKAGE" ? "This configuration package was already imported." : "Import could not be completed. Check its enabled symbols, profile limits, and budget."); return; } setWallets((current) => current.map((wallet) => wallet.id === importWalletId ? { ...wallet, unallocatedCapital: body.walletUnallocatedCapital, bots: [...wallet.bots, { ...body, reservedCapital: "0", openPositionCount: 0, symbols: importPacket.bot.symbols, customInstructions: importPacket.bot.customInstructions, assets: body.assets, lastAnalysis: null }] } : wallet)); setImportOpen(false); pushToast({ tone: "success", title: "Bot imported safely", message: "It is OFF and paused. Review it before enabling it." }); }
  async function exportBot(bot: Bot) { const response = await fetch(`/api/bots/${bot.id}/export`); if (!response.ok) { pushToast({ tone: "error", title: "Bot export failed", message: "Please try again." }); return; } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${bot.name.replaceAll(/[^a-z0-9-_]/gi, "-").toLowerCase() || "bot"}.braiker-bot.json`; link.click(); URL.revokeObjectURL(url); }

  return <div className={styles.botSetup}>
    <header><div><p className="eyebrow">BOT CONFIGURATION</p><h1>Bots</h1></div><div className="headerActions"><button className="secondaryButton" onClick={openImport} disabled={!wallets.length}>Import bot</button><button className="headerAction" onClick={openCreate} disabled={!wallets.length}>Add bot</button></div></header>
    <section className="panel simpleTablePanel"><div className="userTable botTable"><div className="userRow userHead"><span>Bot</span><span>Capital</span><span>Assets</span><span>Survival</span><span>Risk limits</span><span>Universe</span><span>Power</span><span>Actions</span></div>{visibleBotRows.map(({ wallet, bot }) => { const isOn = bot.runMode === "PAPER_ACTIVE" && !bot.killSwitch; const isDead = bot.lifeStatus === "DEAD"; const survival = deriveBotSurvivalState({ lifeStatus: bot.lifeStatus, initialCapital: bot.initialCapital, currentCapital: bot.currentCapital, reservedCapital: bot.reservedCapital, openPositionCount: bot.openPositionCount, lastAnalysisAt: bot.lastAnalysis?.startedAt ?? null, killSwitch: bot.killSwitch }); return <div className="userRow" key={bot.id}><span className="botNameCell"><i className={`avatar ${bot.avatarSeed}`}>{bot.name.slice(0, 1).toUpperCase()}</i><strong><button type="button" className="botHistoryButton" onClick={() => void openHistory(bot)}>{bot.name}</button><small>{bot.templateId} · {wallet.name}</small><small className="lastAnalysis">{bot.lastAnalysis ? `Last analysis: ${dateTime(bot.lastAnalysis.startedAt)} · ${bot.lastAnalysis.status.toLowerCase()}` : "No analysis recorded yet"}</small></strong></span><span><strong>{money(bot.currentCapital)}</strong><small>{isDead ? "Dead — history only" : "Available to this bot"}</small>{!isDead && <button type="button" className="inlineAction" onClick={() => { setCapitalModal({ bot, walletId: wallet.id }); setCapitalAmount(""); }}>Manage</button>}</span><span><strong>{bot.assets.value === null ? "Unavailable" : money(bot.assets.value)}</strong><small>{bot.assets.value === null ? "Sync Alpaca" : bot.assets.valuedAt ? `Valued ${dateTime(bot.assets.valuedAt)}` : "No attributed assets"}</small></span><span><BotSurvivalStatus state={survival} compact /></span><span><strong>${bot.riskPolicy.maxPositionSize}/position</strong><small>${bot.riskPolicy.maxDailyLoss} daily loss · {bot.riskPolicy.maxTradesPerDay}/day</small></span><span>{bot.symbols.join(" · ")}</span><span>{isDead ? <small className="deadHistory">History only</small> : <label className="powerSwitch"><input type="checkbox" checked={isOn} disabled={controllingBotId === bot.id} onChange={(event) => setPower(bot, event.target.checked)} aria-label={`Turn ${bot.name} ${isOn ? "off" : "on"}`} /><i aria-hidden="true" /><strong>{isOn ? "ON" : "OFF"}</strong></label>}</span><span className="botActions"><button className="iconButton" title={`View ${bot.name} history`} onClick={() => void openHistory(bot)} aria-label={`View ${bot.name} history`}>◉</button><button className="iconButton" title={`Export ${bot.name}`} onClick={() => void exportBot(bot)} aria-label={`Export ${bot.name}`}>⇩</button>{!isDead && <button className="iconButton" title={`Edit ${bot.name}`} onClick={() => openEdit(bot, wallet.id)} aria-label={`Edit ${bot.name}`}>✎</button>}</span></div>; })}</div><PaginationControls page={currentBotPage} pageCount={botPageCount} onPageChange={setBotPage} />{wallets.every((wallet) => wallet.bots.length === 0) && <p className="muted">No bots created. Add the first member of your team.</p>}</section>
    {importOpen && <div className="modalOverlay" role="presentation"><section className="modalCard botModal" role="dialog" aria-modal="true" aria-labelledby="import-bot-title"><div className="modalHeading"><div><p className="eyebrow">SAFE CONFIGURATION TRANSFER</p><h2 id="import-bot-title">Import bot</h2></div><button type="button" className="iconButton" onClick={() => setImportOpen(false)} aria-label="Close">×</button></div><div className="formColumns"><label>Wallet<select value={importWalletId} onChange={(event) => setImportWalletId(event.target.value)}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} · ${wallet.unallocatedCapital} available</option>)}</select></label><label>Budget (USD)<input type="number" min="0.01" step="0.01" value={importBudget} onChange={(event) => setImportBudget(event.target.value)} required /></label><label className="fullField importDropZone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void readImportFile(event.dataTransfer.files[0]); }}>Select or drop a .json bot package<input type="file" accept="application/json,.json" onChange={(event) => void readImportFile(event.target.files?.[0])} /></label>{importError && <p className="fieldError fullField">{importError}</p>}{importPacket && <div className="importPreview fullField"><strong>{importPacket.bot.name} · {importPacket.bot.templateId}</strong><small>{importPacket.bot.symbols.join(" · ")}</small><small>{importPacket.bot.customInstructions || "No additional instructions."}</small><small>{importPacket.bot.learnedInstructions.length} internal learning revision(s). Imported bots always start OFF and paused.</small></div>}</div><div className="modalActions"><button type="button" className="secondaryButton" onClick={() => setImportOpen(false)}>Cancel</button><button type="button" onClick={() => void importBot()} disabled={!importPacket || importing}>{importing ? "Importing…" : "Import as OFF bot"}</button></div></section></div>}
    {editorModal && <div className="modalOverlay" role="presentation">
      <section className="modalCard botModal" role="dialog" aria-modal="true" aria-labelledby="bot-modal-title">
        <div className="modalHeading"><div><p className="eyebrow">{editorModal.mode === "create" ? `NEW BOT · STEP ${step}/3` : editorModal.mode === "clone" ? `CLONE BOT · STEP ${step}/3` : `EDIT BOT · STEP ${step}/3`}</p><h2 id="bot-modal-title">{editorModal.mode === "create" ? "Add bot" : editorModal.mode === "clone" ? `Clone ${editorModal.source.name}` : editorModal.bot.name}</h2></div><div className="modalHeadingActions"><button type="button" className="iconButton" onClick={closeEditor} aria-label="Close">×</button></div></div>
        <form ref={formRef} onSubmit={preventImplicitSave}>
          {step === 1 && <div className="templateCards">{templates.map((template) => <button type="button" key={template.id} className={`templateCard ${template.id === templateId ? "selected" : ""}`} onClick={() => setProfileDefaults(template.id)}><span className={`avatar ${template.avatar}`}>{template.name.slice(0, 1)}</span><strong>{template.name}</strong><small>{template.description}</small><em>Profile cap: ${template.riskPolicy.maxPositionSize}/position · {template.riskPolicy.maxTradesPerDay} trades/day</em></button>)}</div>}
          {step === 2 && <div className="formColumns"><label>Bot name<input value={botName} onChange={(event) => setBotName(event.target.value)} minLength={2} required /></label>{isNewBot ? <><label>Wallet<select value={walletId} onChange={(event) => setWalletId(event.target.value)}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} · ${wallet.unallocatedCapital} available</option>)}</select></label><label>Budget (USD)<input type="number" min="0.01" step="0.01" max={selectedWallet?.unallocatedCapital} value={budget} onChange={(event) => setBudget(event.target.value)} required /><small className={budgetError ? "fieldError" : "fieldHelp"}>{budgetError ? "No unallocated capital is available in this wallet." : `$${selectedWallet?.unallocatedCapital ?? "0"} available for this new bot.`}</small></label></> : <label>Current capital<input value={money(budget)} disabled /></label>}<label className="fullField">Additional instructions<textarea value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} maxLength={1200} placeholder="Example: prioritize liquid ETFs and explain every decision in plain language." /><small>Guidance for this bot only. It cannot override mandatory survival rules or risk checks.</small></label></div>}
          {step === 3 && <>
            <details className="symbolSelector"><summary><span>Trading universe</span><strong>{selectedSymbolSummary(selectedSymbols)}</strong><i aria-hidden="true">⌄</i></summary><div className="symbolSelectorOptions"><p>Select the symbols this bot may analyze and trade.</p><div>{symbols.map((symbol) => <label key={symbol}><input type="checkbox" checked={selectedSymbols.includes(symbol)} onChange={() => toggleSymbol(symbol)} /><span>{symbol}</span></label>)}</div></div></details>
            <small className="muted">Open the selector to add or remove symbols. At least one symbol is required.</small>
            <label className={`adaptiveRiskToggle ${adaptiveRiskEnabled ? "enabled" : ""}`}><input type="checkbox" checked={adaptiveRiskEnabled} onChange={(event) => setAdaptiveRiskEnabled(event.target.checked)} aria-describedby="adaptive-risk-help" /><span><strong>Adaptive risk limits <em className="adaptiveRiskState">{adaptiveRiskEnabled ? "Enabled" : "Disabled"}</em></strong><small id="adaptive-risk-help">Let this bot reduce its own limits to protect survival. It can never exceed the saved profile envelope, capital, or mandatory risk controls.</small></span></label>{adaptiveRiskEnabled ? <p className="adaptiveRiskNotice">This bot starts from the {activeTemplate.name} envelope and applies only deterministic reductions after realized drawdowns. The saved limits remain in its audit history.</p> : <fieldset className="riskLimits"><legend>Bot risk limits <small>May be lower than the {activeTemplate.name} profile, never higher.</small></legend><label>Max position (USD)<input type="number" min="0.01" step="0.01" max={activeTemplate.riskPolicy.maxPositionSize} value={maxPositionSize} onChange={(event) => setMaxPositionSize(event.target.value)} required /></label><label>Max daily loss (USD)<input type="number" min="0.01" step="0.01" max={activeTemplate.riskPolicy.maxDailyLoss} value={maxDailyLoss} onChange={(event) => setMaxDailyLoss(event.target.value)} required /></label><label>Max trades / day<input type="number" min="1" step="1" max={activeTemplate.riskPolicy.maxTradesPerDay} value={maxTradesPerDay} onChange={(event) => setMaxTradesPerDay(event.target.value)} required /></label></fieldset>}
          </>}
          <div className="modalActions">{step > 1 && <button type="button" className="secondaryButton" onClick={() => setStep(step - 1)}>Back</button>}{step < 3 ? <button type="button" disabled={step === 2 && (!botName || Boolean(budgetError))} onClick={() => setStep(nextBotWizardStep(step))}>Continue</button> : <button type="button" disabled={!selectedSymbols.length || Boolean(budgetError)} onClick={() => void save()}>{isNewBot ? `Create ${activeTemplate.name}` : "Save bot"}</button>}</div>
        </form>
        {editorModal.mode === "edit" && <div className="dangerZone">{confirmDelete ? <><p>Delete {editorModal.bot.name}? Its current capital returns to the wallet.</p><div><button type="button" className="secondaryButton" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="dangerButton" onClick={remove}>Confirm delete</button></div></> : <div className="dangerZoneActions"><button type="button" className="dangerButton" onClick={() => setConfirmDelete(true)}>Delete bot</button><button type="button" className="secondaryButton" onClick={() => openClone(editorModal.bot, editorModal.walletId)}>Clone bot</button></div>}</div>}
      </section>
    </div>}
    {capitalModal && <div className="modalOverlay" role="presentation"><section className="modalCard capitalModal" role="dialog" aria-modal="true" aria-labelledby="capital-modal-title"><div className="modalHeading"><div><p className="eyebrow">BOT CAPITAL</p><h2 id="capital-modal-title">Manage {capitalModal.bot.name}</h2></div><button type="button" className="iconButton" onClick={closeCapital} aria-label="Close">×</button></div><form onSubmit={saveCapital}><div className="capitalSnapshot"><span><small>Bot capital</small><strong>{money(capitalModal.bot.currentCapital)}</strong></span><span><small>Wallet available</small><strong>{money(wallets.find((wallet) => wallet.id === capitalModal.walletId)?.unallocatedCapital ?? "0")}</strong></span></div><div className="capitalDirection"><button type="button" className={capitalDirection === "ADD" ? "selected" : "secondaryButton"} onClick={() => setCapitalDirection("ADD")}>Add capital</button><button type="button" className={capitalDirection === "WITHDRAW" ? "selected" : "secondaryButton"} onClick={() => setCapitalDirection("WITHDRAW")}>Return capital</button></div><label>Amount (USD)<input type="number" min="0.01" step="0.01" max={capitalDirection === "WITHDRAW" ? capitalModal.bot.currentCapital : wallets.find((wallet) => wallet.id === capitalModal.walletId)?.unallocatedCapital} value={capitalAmount} onChange={(event) => setCapitalAmount(event.target.value)} required /></label><p className="muted">{capitalDirection === "ADD" ? "This moves currently unallocated wallet capital to this bot." : "This returns part of the bot's current capital to the wallet. To return all capital, turn the bot off and delete it."}</p><button type="submit" disabled={savingCapital}>{savingCapital ? "Saving…" : capitalDirection === "ADD" ? "Add capital" : "Return capital"}</button></form></section></div>}
    {historyBot && <BotHistoryModal bot={historyBot} onClose={() => setHistoryBot(null)} />}
  </div>;
}
