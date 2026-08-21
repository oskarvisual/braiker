"use client";

import { FormEvent, useState } from "react";
import { useToast } from "@/components/toast";

type Wallet = { id: string; name: string; currency: string; managedCapital: string; unallocatedCapital: string };
type PaperCapital = { managedCapital: string; availableCapital: string; allocatedCapital: string };
type SyncSettings = { enabled: boolean; intervalMinutes: number; timezone: string };
type NotificationSettings = { webhook: { enabled: boolean; configured: boolean; events: string[] }; email: { enabled: boolean; recipients: string[]; events: string[] }; smtpConfigured: boolean };
type NotificationEvent = { id: string; label: string; description: string };
type BotProfile = { id: string; name: string; description: string; avatar: string; riskPolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number } };

function humanError(code: string) {
  if (code === "INSUFFICIENT_PAPER_CAPITAL") return "There is not enough unassigned virtual capital. Increase the global Paper capital or free capital from another wallet.";
  if (code === "WALLET_CAPITAL_ASSIGNED_TO_BOTS") return "That amount is already assigned to bots in this wallet. Return or withdraw bot capital first.";
  if (code === "PAPER_CAPITAL_EXCEEDS_BROKER_CASH") return "Global Paper capital cannot exceed the cash currently reported by Alpaca Paper.";
  if (code === "INVALID_VIRTUAL_CAPITAL" || code === "INVALID_PAPER_CAPITAL") return "Enter a positive USD amount with up to 12 decimal places.";
  if (code === "MAX_POSITION_SIZE_EXCEEDS_PROFILE_ENVELOPE") return "The position cap exceeds this personality's permanent portfolio safety envelope.";
  if (code === "MAX_DAILY_LOSS_EXCEEDS_PROFILE_ENVELOPE") return "The daily-loss cap exceeds this personality's permanent weekly-loss safety envelope.";
  if (code === "MAX_TRADES_EXCEEDS_PROFILE_ENVELOPE") return "The trade count exceeds this personality's permanent safety envelope.";
  if (code === "INVALID_PROFILE_DEFAULTS") return "Enter positive values for all three profile defaults.";
  return code || "Please try again.";
}

export function Settings({ initialWallets, initialPaperCapital, initialSync, initialNotifications, notificationEvents, botProfiles: initialBotProfiles }: { initialWallets: Wallet[]; initialPaperCapital: PaperCapital; initialSync: SyncSettings; initialNotifications: NotificationSettings; notificationEvents: readonly NotificationEvent[]; botProfiles: BotProfile[] }) {
  const [wallets, setWallets] = useState(initialWallets);
  const [botProfiles, setBotProfiles] = useState(initialBotProfiles);
  const [paperCapital, setPaperCapital] = useState(initialPaperCapital);
  const [managedCapital, setManagedCapital] = useState(initialPaperCapital.managedCapital);
  const [sync, setSync] = useState(initialSync);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [walletCapital, setWalletCapital] = useState("100");
  const [capitalWallet, setCapitalWallet] = useState<Wallet | null>(null);
  const [capitalDirection, setCapitalDirection] = useState<"ADD" | "WITHDRAW">("ADD");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [editingProfile, setEditingProfile] = useState<BotProfile | null>(null);
  const [profilePosition, setProfilePosition] = useState("");
  const [profileDailyLoss, setProfileDailyLoss] = useState("");
  const [profileTrades, setProfileTrades] = useState("");
  const [saving, setSaving] = useState(false);
  const { pushToast } = useToast();

  function closeWalletModal() { setShowWalletModal(false); setWalletName(""); setWalletCapital("100"); }
  function closeCapitalModal() { setCapitalWallet(null); setCapitalAmount(""); setCapitalDirection("ADD"); }
  function openProfileModal(profile: BotProfile) { setEditingProfile(profile); setProfilePosition(profile.riskPolicy.maxPositionSize); setProfileDailyLoss(profile.riskPolicy.maxDailyLoss); setProfileTrades(String(profile.riskPolicy.maxTradesPerDay)); }
  function closeProfileModal() { setEditingProfile(null); }
  function openCapitalModal(wallet: Wallet) { setCapitalWallet(wallet); setCapitalAmount(""); setCapitalDirection("ADD"); }
  function toggleEvent(channel: "webhook" | "email", eventId: string) {
    setNotifications((current) => ({ ...current, [channel]: { ...current[channel], events: current[channel].events.includes(eventId) ? current[channel].events.filter((id) => id !== eventId) : [...current[channel].events, eventId] } }));
  }
  async function savePaperCapital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/settings/paper-capital", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ managedCapital }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Global Paper capital was not saved", message: humanError(body.error) }); return; }
    setPaperCapital({ managedCapital: body.managedCapital, availableCapital: body.availableCapital, allocatedCapital: body.allocatedCapital }); setManagedCapital(body.managedCapital);
    pushToast({ tone: "success", title: "Global Paper capital saved", message: `Broker cash reported: $${body.brokerCash}.` });
  }
  async function saveSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/settings/synchronization", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(sync) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Synchronization settings were not saved", message: body.error ?? "Please try again." }); return; }
    setSync((current) => ({ ...current, enabled: body.enabled, intervalMinutes: body.intervalMinutes, timezone: body.timezone })); pushToast({ tone: "success", title: "Synchronization settings saved" });
  }
  async function saveNotifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/settings/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ webhook: { enabled: notifications.webhook.enabled, url: webhookUrl, events: notifications.webhook.events }, email: notifications.email }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Alert preferences were not saved", message: body.error ?? "Please try again." }); return; }
    setNotifications(body); setWebhookUrl(""); pushToast({ tone: "success", title: "Alert preferences saved" });
  }
  async function saveWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/wallets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: walletName, managedCapital: walletCapital }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "We could not create this virtual wallet", message: humanError(body.error) }); return; }
    setWallets((current) => [{ id: body.id, name: body.name, currency: body.currency, managedCapital: body.managedCapital, unallocatedCapital: body.unallocatedCapital }, ...current]);
    setPaperCapital((current) => ({ ...current, availableCapital: body.paperCapitalAvailable })); closeWalletModal();
    pushToast({ tone: "success", title: "Virtual wallet created", message: "It uses the single global Alpaca Paper connection from the server environment." });
  }
  async function saveWalletCapital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capitalWallet) return;
    setSaving(true);
    const response = await fetch(`/api/wallets/${capitalWallet.id}/capital`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: capitalDirection, amount: capitalAmount }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Wallet capital was not updated", message: humanError(body.error) }); return; }
    setWallets((current) => current.map((wallet) => wallet.id === capitalWallet.id ? { ...wallet, managedCapital: body.managedCapital, unallocatedCapital: body.unallocatedCapital } : wallet));
    setPaperCapital((current) => ({ ...current, availableCapital: body.paperCapitalAvailable, allocatedCapital: body.paperCapitalAllocated }));
    closeCapitalModal();
    pushToast({ tone: "success", title: capitalDirection === "ADD" ? "Wallet capital added" : "Wallet capital released", message: "No money was moved at Alpaca." });
  }
  async function saveProfileDefaults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProfile) return;
    setSaving(true);
    const response = await fetch("/api/settings/bot-profiles", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateId: editingProfile.id, riskLimits: { maxPositionSize: profilePosition, maxDailyLoss: profileDailyLoss, maxTradesPerDay: Number(profileTrades) } }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Profile defaults were not saved", message: humanError(body.error) }); return; }
    setBotProfiles((current) => current.map((profile) => profile.id === body.id ? body : profile));
    closeProfileModal();
    pushToast({ tone: "success", title: `${body.name} defaults saved`, message: "New bots and future edits may use these configured caps." });
  }

  return <>
    <header><div><p className="eyebrow">SYSTEM CONFIGURATION</p><h1>Settings</h1><p className="pageLead">One global Alpaca Paper account, virtual portfolios, safe automation and alert destinations.</p></div></header>
    <div className="settingsGrid">
      <section className="panel settingsPanel"><div className="panelHeading"><div><p className="eyebrow">GLOBAL PAPER CAPITAL</p><h2>Virtual capital pool</h2></div><button className="compactButton" onClick={() => setShowWalletModal(true)}>Add wallet</button></div><p className="muted">Alpaca credentials are server-only environment variables. Wallets below are virtual portfolios that share this one Paper account; creating one never transfers money at Alpaca.</p><div className="paperCapitalStats"><span><small>Enabled in BrAIker</small><strong>${paperCapital.managedCapital}</strong></span><span><small>Assigned to wallets</small><strong>${paperCapital.allocatedCapital}</strong></span><span><small>Available to assign</small><strong>${paperCapital.availableCapital}</strong></span></div><form className="settingsControl" onSubmit={savePaperCapital}><label>Global Paper capital (USD)<input type="number" min="0" step="0.01" value={managedCapital} onChange={(event) => setManagedCapital(event.target.value)} required /></label><small className="muted">This is BrAIker’s safety envelope. It may not exceed the cash reported by the one Alpaca Paper account.</small><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save global capital"}</button></form><div className="walletSettingsList">{wallets.map((wallet) => <article key={wallet.id}><div><strong>{wallet.name}</strong><small>{wallet.currency} · ${wallet.unallocatedCapital} unassigned of ${wallet.managedCapital}</small></div><div className="walletActions"><span className="connectionStatus connected">Global Paper account</span><button type="button" className="secondaryButton" onClick={() => openCapitalModal(wallet)}>Manage budget</button></div></article>)}</div></section>
      <section className="panel settingsPanel"><div><p className="eyebrow">AUTOMATION</p><h2>Portfolio synchronization</h2></div><p className="muted">The worker reconciles the one Paper account, positions and orders on this schedule. Manual sync remains available from the dashboard.</p><form className="settingsControl" onSubmit={saveSync}><label className="toggleRow"><input type="checkbox" checked={sync.enabled} onChange={(event) => setSync((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>Automatic sync</strong><small>Run global reconciliation in the background.</small></span></label><label>Frequency<select value={sync.intervalMinutes} onChange={(event) => setSync((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))} disabled={!sync.enabled}>{[1, 5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>Every {minutes} {minutes === 1 ? "minute" : "minutes"}</option>)}</select></label><small className="muted">Timezone: {sync.timezone}. Changes apply on the next worker minute.</small><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save synchronization"}</button></form></section>
    </div>
    <section className="panel settingsPanel notificationPanel"><div><p className="eyebrow">ALERTS</p><h2>Webhooks and email</h2><p className="muted">Choose which operating events should notify you. Webhook URLs are encrypted at rest and never displayed again.</p></div><form className="notificationForm" onSubmit={saveNotifications}>
      <div className="notificationChannel"><label className="toggleRow"><input type="checkbox" checked={notifications.webhook.enabled} onChange={(event) => setNotifications((current) => ({ ...current, webhook: { ...current.webhook, enabled: event.target.checked } }))} /><span><strong>Webhook alerts</strong><small>{notifications.webhook.configured ? "A secure destination is saved. Enter a URL below only to replace it." : "Use an HTTPS endpoint from Slack, Discord, Zapier, or your own service."}</small></span></label><label>Webhook URL<input type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={notifications.webhook.configured ? "Configured — leave blank to keep it" : "https://hooks.example.com/braiker"} disabled={!notifications.webhook.enabled} /></label><div className="eventOptions">{notificationEvents.map((event) => <label key={`webhook-${event.id}`}><input type="checkbox" checked={notifications.webhook.events.includes(event.id)} onChange={() => toggleEvent("webhook", event.id)} disabled={!notifications.webhook.enabled} /><span><strong>{event.label}</strong><small>{event.description}</small></span></label>)}</div></div>
      <div className="notificationChannel"><label className="toggleRow"><input type="checkbox" checked={notifications.email.enabled} onChange={(event) => setNotifications((current) => ({ ...current, email: { ...current.email, enabled: event.target.checked } }))} /><span><strong>Email alerts</strong><small>{notifications.smtpConfigured ? "SMTP is configured in the environment." : "Add SMTP_HOST and related SMTP values in .env before delivery can be activated."}</small></span></label><label>Recipients<input type="text" value={notifications.email.recipients.join(", ")} onChange={(event) => setNotifications((current) => ({ ...current, email: { ...current.email, recipients: event.target.value.split(",").map((recipient) => recipient.trim()).filter(Boolean) } }))} placeholder="you@example.com, team@example.com" disabled={!notifications.email.enabled} /></label><div className="eventOptions">{notificationEvents.map((event) => <label key={`email-${event.id}`}><input type="checkbox" checked={notifications.email.events.includes(event.id)} onChange={() => toggleEvent("email", event.id)} disabled={!notifications.email.enabled} /><span><strong>{event.label}</strong><small>{event.description}</small></span></label>)}</div></div>
      <div className="notificationActions"><p className="muted">Selected operational failures are delivered once per channel, then retried at a bounded interval until delivery succeeds. SMTP must be configured for email.</p><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save alert preferences"}</button></div>
    </form></section>
    <section className="panel settingsPanel botDefaultsPanel"><div><p className="eyebrow">BOT DEFAULTS</p><h2>Base mindsets and guardrails</h2><p className="muted">These are the starting caps for new bots. An existing bot keeps its saved limits until you edit it; then it may be set anywhere up to its current personality cap.</p></div><div className="profileDefaults">{botProfiles.map((profile) => <article key={profile.id}><i className={`avatar ${profile.avatar}`}>{profile.name.slice(0, 1)}</i><div><strong>{profile.name}</strong><small>{profile.description}</small><em>Position ≤ ${profile.riskPolicy.maxPositionSize} · daily loss ≤ ${profile.riskPolicy.maxDailyLoss} · {profile.riskPolicy.maxTradesPerDay} trades/day</em><button type="button" className="secondaryButton profileEditButton" onClick={() => openProfileModal(profile)}>Edit defaults</button></div></article>)}</div></section>
    {showWalletModal && <div className="modalOverlay" role="presentation"><section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title"><div className="modalHeading"><div><p className="eyebrow">NEW VIRTUAL WALLET</p><h2 id="settings-modal-title">Add wallet</h2></div><button type="button" className="iconButton" onClick={closeWalletModal} aria-label="Close">×</button></div><form onSubmit={saveWallet}><label>Wallet name<input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Trading experiments" minLength={2} maxLength={120} required /></label><label>Virtual capital (USD)<input type="number" value={walletCapital} onChange={(event) => setWalletCapital(event.target.value)} min="0.01" step="0.01" required /></label><p className="muted">Available in the global Paper pool: ${paperCapital.availableCapital}. This only reserves capital inside BrAIker; it does not move money in Alpaca.</p><button type="submit" disabled={saving}>{saving ? "Creating…" : "Create virtual wallet"}</button></form></section></div>}
    {capitalWallet && <div className="modalOverlay" role="presentation"><section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="wallet-capital-modal-title"><div className="modalHeading"><div><p className="eyebrow">VIRTUAL WALLET BUDGET</p><h2 id="wallet-capital-modal-title">{capitalWallet.name}</h2></div><button type="button" className="iconButton" onClick={closeCapitalModal} aria-label="Close">×</button></div><form onSubmit={saveWalletCapital}><label>Action<select value={capitalDirection} onChange={(event) => setCapitalDirection(event.target.value as "ADD" | "WITHDRAW")}><option value="ADD">Add capital from global pool</option><option value="WITHDRAW">Release unassigned capital</option></select></label><label>Amount (USD)<input type="number" value={capitalAmount} onChange={(event) => setCapitalAmount(event.target.value)} min="0.01" step="0.01" required /></label><p className="muted">Wallet: ${capitalWallet.unallocatedCapital} unassigned of ${capitalWallet.managedCapital}. Global pool: ${paperCapital.availableCapital} available. You can only release capital not currently assigned to bots.</p><div className="modalActions"><button type="button" className="secondaryButton" onClick={closeCapitalModal}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : capitalDirection === "ADD" ? "Add capital" : "Release capital"}</button></div></form></section></div>}
    {editingProfile && <div className="modalOverlay" role="presentation"><section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="profile-default-modal-title"><div className="modalHeading"><div><p className="eyebrow">BOT DEFAULTS</p><h2 id="profile-default-modal-title">{editingProfile.name}</h2></div><button type="button" className="iconButton" onClick={closeProfileModal} aria-label="Close">×</button></div><form onSubmit={saveProfileDefaults}><p className="muted">These caps apply to new {editingProfile.name} bots. Existing bots are only changed when you save their own configuration.</p><fieldset className="riskLimits"><legend>Default risk limits</legend><label>Max position (USD)<input type="number" min="0.01" step="0.01" value={profilePosition} onChange={(event) => setProfilePosition(event.target.value)} required /></label><label>Max daily loss (USD)<input type="number" min="0.01" step="0.01" value={profileDailyLoss} onChange={(event) => setProfileDailyLoss(event.target.value)} required /></label><label>Max trades / day<input type="number" min="1" step="1" value={profileTrades} onChange={(event) => setProfileTrades(event.target.value)} required /></label></fieldset><p className="muted">The permanent paper-only safety envelope remains enforced: no leverage, margin, shorting, options, or wider portfolio and weekly-loss boundaries.</p><div className="modalActions"><button type="button" className="secondaryButton" onClick={closeProfileModal}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save defaults"}</button></div></form></section></div>}
  </>;
}
