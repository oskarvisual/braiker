"use client";

import { FormEvent, useState } from "react";
import { useToast } from "@/components/toast";

type Wallet = { id: string; name: string; currency: string; managedCapital: string; unallocatedCapital: string; alpacaConfigured: boolean };
type SyncSettings = { enabled: boolean; intervalMinutes: number; timezone: string };
type NotificationSettings = { webhook: { enabled: boolean; configured: boolean; events: string[] }; email: { enabled: boolean; recipients: string[]; events: string[] }; smtpConfigured: boolean };
type NotificationEvent = { id: string; label: string; description: string };
type BotProfile = { id: string; name: string; description: string; avatar: string; riskPolicy: { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number } };
type Modal = null | { mode: "wallet" } | { mode: "credentials"; wallet: Wallet };

export function Settings({ initialWallets, initialSync, initialNotifications, notificationEvents, botProfiles }: { initialWallets: Wallet[]; initialSync: SyncSettings; initialNotifications: NotificationSettings; notificationEvents: readonly NotificationEvent[]; botProfiles: BotProfile[] }) {
  const [wallets, setWallets] = useState(initialWallets);
  const [sync, setSync] = useState(initialSync);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [walletName, setWalletName] = useState("");
  const [capital, setCapital] = useState("100");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const { pushToast } = useToast();

  function close() { setModal(null); setWalletName(""); setCapital("100"); setApiKey(""); setApiSecret(""); }
  function toggleEvent(channel: "webhook" | "email", eventId: string) {
    setNotifications((current) => ({ ...current, [channel]: { ...current[channel], events: current[channel].events.includes(eventId) ? current[channel].events.filter((id) => id !== eventId) : [...current[channel].events, eventId] } }));
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
    const response = await fetch("/api/wallets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: walletName, managedCapital: capital }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "We could not create this wallet", message: body.error ?? "Please try again." }); return; }
    setWallets((current) => [{ ...body, alpacaConfigured: false }, ...current]); close(); pushToast({ tone: "success", title: "Wallet created", message: "Connect Alpaca Paper before using it." });
  }
  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (modal?.mode !== "credentials") return; setSaving(true);
    const response = await fetch(`/api/wallets/${modal.wallet.id}/broker`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey, apiSecret }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { pushToast({ tone: "error", title: "Alpaca Paper connection was not saved", message: body.error ?? "Please try again." }); return; }
    setWallets((current) => current.map((wallet) => wallet.id === modal.wallet.id ? { ...wallet, alpacaConfigured: true } : wallet)); close(); pushToast({ tone: "success", title: "Alpaca Paper connection saved securely" });
  }

  return <>
    <header><div><p className="eyebrow">SYSTEM CONFIGURATION</p><h1>Settings</h1><p className="pageLead">Paper wallets, safety defaults, background synchronization and alert destinations.</p></div></header>
    <div className="settingsGrid">
      <section className="panel settingsPanel"><div className="panelHeading"><div><p className="eyebrow">WALLETS</p><h2>Paper capital</h2></div><button className="compactButton" onClick={() => setModal({ mode: "wallet" })}>Add wallet</button></div><p className="muted">Each wallet keeps its own capital allocation and encrypted Alpaca Paper connection.</p><div className="walletSettingsList">{wallets.map((wallet) => <article key={wallet.id}><div><strong>{wallet.name}</strong><small>{wallet.currency} · ${wallet.unallocatedCapital} unassigned of ${wallet.managedCapital}</small></div><div className="walletActions"><span className={wallet.alpacaConfigured ? "connectionStatus connected" : "connectionStatus"}>{wallet.alpacaConfigured ? "Alpaca Paper connected" : "Not connected"}</span><button className="secondaryButton" onClick={() => setModal({ mode: "credentials", wallet })}>{wallet.alpacaConfigured ? "Replace connection" : "Connect Alpaca"}</button></div></article>)}</div></section>
      <section className="panel settingsPanel"><div><p className="eyebrow">AUTOMATION</p><h2>Portfolio synchronization</h2></div><p className="muted">The worker reads the latest Paper account, positions and order status on this schedule. Manual sync remains available from the dashboard.</p><form className="settingsControl" onSubmit={saveSync}><label className="toggleRow"><input type="checkbox" checked={sync.enabled} onChange={(event) => setSync((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>Automatic sync</strong><small>Run reconciliation in the background.</small></span></label><label>Frequency<select value={sync.intervalMinutes} onChange={(event) => setSync((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))} disabled={!sync.enabled}>{[1, 5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>Every {minutes} {minutes === 1 ? "minute" : "minutes"}</option>)}</select></label><small className="muted">Timezone: {sync.timezone}. Changes apply on the next worker minute.</small><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save synchronization"}</button></form></section>
    </div>
    <section className="panel settingsPanel notificationPanel"><div><p className="eyebrow">ALERTS</p><h2>Webhooks and email</h2><p className="muted">Choose which operating events should notify you. Webhook URLs are encrypted at rest and never displayed again.</p></div><form className="notificationForm" onSubmit={saveNotifications}>
      <div className="notificationChannel"><label className="toggleRow"><input type="checkbox" checked={notifications.webhook.enabled} onChange={(event) => setNotifications((current) => ({ ...current, webhook: { ...current.webhook, enabled: event.target.checked } }))} /><span><strong>Webhook alerts</strong><small>{notifications.webhook.configured ? "A secure destination is saved. Enter a URL below only to replace it." : "Use an HTTPS endpoint from Slack, Discord, Zapier, or your own service."}</small></span></label><label>Webhook URL<input type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={notifications.webhook.configured ? "Configured — leave blank to keep it" : "https://hooks.example.com/braiker"} disabled={!notifications.webhook.enabled} /></label><div className="eventOptions">{notificationEvents.map((event) => <label key={`webhook-${event.id}`}><input type="checkbox" checked={notifications.webhook.events.includes(event.id)} onChange={() => toggleEvent("webhook", event.id)} disabled={!notifications.webhook.enabled} /><span><strong>{event.label}</strong><small>{event.description}</small></span></label>)}</div></div>
      <div className="notificationChannel"><label className="toggleRow"><input type="checkbox" checked={notifications.email.enabled} onChange={(event) => setNotifications((current) => ({ ...current, email: { ...current.email, enabled: event.target.checked } }))} /><span><strong>Email alerts</strong><small>{notifications.smtpConfigured ? "SMTP is configured in the environment." : "Add SMTP_HOST and related SMTP values in .env before delivery can be activated."}</small></span></label><label>Recipients<input type="text" value={notifications.email.recipients.join(", ")} onChange={(event) => setNotifications((current) => ({ ...current, email: { ...current.email, recipients: event.target.value.split(",").map((recipient) => recipient.trim()).filter(Boolean) } }))} placeholder="you@example.com, team@example.com" disabled={!notifications.email.enabled} /></label><div className="eventOptions">{notificationEvents.map((event) => <label key={`email-${event.id}`}><input type="checkbox" checked={notifications.email.events.includes(event.id)} onChange={() => toggleEvent("email", event.id)} disabled={!notifications.email.enabled} /><span><strong>{event.label}</strong><small>{event.description}</small></span></label>)}</div></div>
      <div className="notificationActions"><p className="muted">Preferences are saved now. Delivery begins only when the relevant durable system event is implemented and SMTP is configured for email.</p><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save alert preferences"}</button></div>
    </form></section>
    <section className="panel settingsPanel botDefaultsPanel"><div><p className="eyebrow">BOT DEFAULTS</p><h2>Base mindsets and guardrails</h2><p className="muted">A new bot starts from one of these profiles. Its own limits may be lower, but never exceed the selected profile. Existing bots retain their saved configuration.</p></div><div className="profileDefaults">{botProfiles.map((profile) => <article key={profile.id}><i className={`avatar ${profile.avatar}`}>{profile.name.slice(0, 1)}</i><div><strong>{profile.name}</strong><small>{profile.description}</small><em>Position ≤ ${profile.riskPolicy.maxPositionSize} · daily loss ≤ ${profile.riskPolicy.maxDailyLoss} · {profile.riskPolicy.maxTradesPerDay} trades/day</em></div></article>)}</div></section>
    {modal && <div className="modalOverlay" role="presentation"><section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title"><div className="modalHeading"><div><p className="eyebrow">{modal.mode === "wallet" ? "NEW PAPER WALLET" : "ALPACA PAPER"}</p><h2 id="settings-modal-title">{modal.mode === "wallet" ? "Add wallet" : `Connect ${modal.wallet.name}`}</h2></div><button type="button" className="iconButton" onClick={close} aria-label="Close">×</button></div>{modal.mode === "wallet" ? <form onSubmit={saveWallet}><label>Wallet name<input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Trading experiments" minLength={2} maxLength={120} required /></label><label>Managed capital (USD)<input type="number" value={capital} onChange={(event) => setCapital(event.target.value)} min="0.01" step="0.01" required /></label><p className="muted">This only allocates capital inside BrAIker. No funds are transferred to Alpaca.</p><button type="submit" disabled={saving}>{saving ? "Creating…" : "Create wallet"}</button></form> : <form onSubmit={saveCredentials}><label>Alpaca Paper API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" minLength={8} required /></label><label>Alpaca Paper secret<input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" minLength={8} required /></label><p className="muted">These are encrypted before storage and are never displayed again.</p><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save secure connection"}</button></form>}</section></div>}
  </>;
}
