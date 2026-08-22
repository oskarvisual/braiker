"use client";

import { useEffect, useMemo, useState } from "react";

type Asset = { symbol: string; name: string; exchange: string; enabled: boolean; active: boolean; tradable: boolean };

export function AssetUniversePanel() {
  const [assets, setAssets] = useState<Asset[]>([]); const [query, setQuery] = useState(""); const [syncing, setSyncing] = useState(false); const [notice, setNotice] = useState("");
  async function load() { const response = await fetch("/api/settings/assets", { cache: "no-store" }); if (response.ok) setAssets(await response.json()); }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => assets.filter((asset) => `${asset.symbol} ${asset.name} ${asset.exchange}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100), [assets, query]);
  async function sync() { setSyncing(true); const response = await fetch("/api/settings/assets", { method: "POST" }); const body = await response.json(); setSyncing(false); setNotice(response.ok ? `${body.synced} Alpaca assets synchronized. New assets remain disabled until you select them.` : body.error ?? "Asset synchronization failed."); if (response.ok) void load(); }
  async function toggle(asset: Asset) { const response = await fetch("/api/settings/assets", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: asset.symbol, enabled: !asset.enabled }) }); const body = await response.json(); if (!response.ok) { setNotice(body.error ?? "Asset update failed."); return; } setAssets((current) => current.map((item) => item.symbol === asset.symbol ? { ...item, enabled: body.enabled } : item)); setNotice(body.enabled ? `${asset.symbol} is now available to bots.` : `${asset.symbol} was removed from every bot watchlist.`); }
  return <section className="panel settingsPanel assetUniversePanel"><div className="panelHeading"><div><p className="eyebrow">GLOBAL TRADING UNIVERSE</p><h2>US stocks & ETFs</h2><p className="muted">Only selected Alpaca Paper-tradable US equities may be added to a bot. Removing one here immediately removes it from every bot; enabling it later never restores prior assignments.</p></div><button type="button" className="secondaryButton" onClick={() => void sync()} disabled={syncing}>{syncing ? "Synchronizing…" : "Sync Alpaca assets"}</button></div><label className="assetSearch">Search assets<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Symbol, name, or exchange" /></label><p className="muted assetUniverseNotice">{notice || `${assets.filter((asset) => asset.enabled).length} globally enabled assets`}</p><div className="assetUniverseList">{filtered.map((asset) => <label key={asset.symbol}><input type="checkbox" checked={asset.enabled} disabled={!asset.active || !asset.tradable} onChange={() => void toggle(asset)} /><span><strong>{asset.symbol}</strong><small>{asset.name} · {asset.exchange}</small></span></label>)}</div></section>;
}
