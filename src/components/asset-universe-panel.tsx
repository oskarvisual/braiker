"use client";

import { useEffect, useRef, useState } from "react";
import { assetUniverseFeedback } from "@/modules/watchlist/asset-universe-feedback";

type Asset = { symbol: string; name: string; exchange: string; enabled: boolean; active: boolean; tradable: boolean };
type AssetPage = { assets: Asset[]; nextCursor: string | null; total: number };
const EMPTY_PAGE: AssetPage = { assets: [], nextCursor: null, total: 0 };

function matchesSearch(asset: Asset, search: string) {
  return `${asset.symbol} ${asset.name} ${asset.exchange}`.toLowerCase().includes(search.trim().toLowerCase());
}

export function AssetUniversePanel() {
  const [selectedSearch, setSelectedSearch] = useState(""); const [availableSearch, setAvailableSearch] = useState("");
  const [selected, setSelected] = useState<AssetPage>(EMPTY_PAGE); const [available, setAvailable] = useState<AssetPage>(EMPTY_PAGE);
  const [syncing, setSyncing] = useState(false); const [notice, setNotice] = useState(""); const requestIds = useRef({ selected: 0, available: 0 });
  async function loadPage(enabled: boolean, search: string, cursor: string | null = null, append = false) {
    const key = enabled ? "selected" : "available"; const requestId = ++requestIds.current[key]; const params = new URLSearchParams({ enabled: String(enabled) });
    if (search.trim()) params.set("q", search.trim()); if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/settings/assets?${params.toString()}`, { cache: "no-store" }); const body = await response.json() as AssetPage | { error?: string };
      if (!response.ok || !("assets" in body)) { setNotice(assetUniverseFeedback("error" in body ? body.error : undefined)); return; }
      if (requestId !== requestIds.current[key]) return;
      const setPage = enabled ? setSelected : setAvailable;
      setPage((current) => ({ ...body, assets: append ? [...current.assets, ...body.assets] : body.assets }));
    } catch { setNotice(assetUniverseFeedback(undefined)); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void loadPage(true, selectedSearch); }, 180); return () => window.clearTimeout(timer); }, [selectedSearch]);
  useEffect(() => { const timer = window.setTimeout(() => { void loadPage(false, availableSearch); }, 180); return () => window.clearTimeout(timer); }, [availableSearch]);
  async function sync() { setSyncing(true); try { const response = await fetch("/api/settings/assets", { method: "POST" }); const body = await response.json() as { synced?: number; error?: string }; setNotice(response.ok ? `${body.synced} Alpaca assets synchronized. New assets remain disabled until you select them.` : assetUniverseFeedback(body.error)); if (response.ok) { void loadPage(true, selectedSearch); void loadPage(false, availableSearch); } } catch { setNotice(assetUniverseFeedback(undefined)); } finally { setSyncing(false); } }
  async function toggle(asset: Asset) { try { const response = await fetch("/api/settings/assets", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: asset.symbol, enabled: !asset.enabled }) }); const body = await response.json() as { enabled?: boolean; error?: string }; if (!response.ok || typeof body.enabled !== "boolean") { setNotice(assetUniverseFeedback(body.error)); return; } const moved = { ...asset, enabled: body.enabled }; const sourceSetter = asset.enabled ? setSelected : setAvailable; const targetSetter = asset.enabled ? setAvailable : setSelected; const targetSearch = asset.enabled ? availableSearch : selectedSearch; sourceSetter((current) => ({ ...current, assets: current.assets.filter((item) => item.symbol !== asset.symbol), total: Math.max(0, current.total - 1) })); targetSetter((current) => ({ ...current, assets: matchesSearch(moved, targetSearch) ? [moved, ...current.assets.filter((item) => item.symbol !== moved.symbol)].sort((left, right) => left.symbol.localeCompare(right.symbol)).slice(0, 100) : current.assets, total: current.total + 1 })); setNotice(body.enabled ? `${asset.symbol} is now available to bots.` : `${asset.symbol} was removed from every bot watchlist.`); } catch { setNotice(assetUniverseFeedback(undefined)); } }
  const renderList = (title: string, enabled: boolean, search: string, setSearch: (value: string) => void, page: AssetPage) => <section className="assetUniverseGroup"><div className="assetUniverseGroupHeading"><div><h3>{title}</h3><p className="muted">{page.total} {page.total === 1 ? "asset" : "assets"}</p></div></div><label className="assetSearch">Search {title.toLowerCase()}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol, name, or exchange" /></label><div className="assetUniverseList">{page.assets.map((asset) => <label key={asset.symbol}><input type="checkbox" checked={asset.enabled} disabled={!asset.active || !asset.tradable} onChange={() => void toggle(asset)} /><span><strong>{asset.symbol}</strong><small>{asset.name} · {asset.exchange}</small></span></label>)}</div>{page.assets.length === 0 ? <p className="muted assetEmptyState">No matching assets.</p> : null}{page.nextCursor ? <button type="button" className="secondaryButton assetLoadMore" onClick={() => void loadPage(enabled, search, page.nextCursor, true)}>Load more</button> : null}</section>;
  return <section className="panel settingsPanel assetUniversePanel"><div className="panelHeading"><div><p className="eyebrow">GLOBAL TRADING UNIVERSE</p><h2>US stocks & ETFs</h2><p className="muted">Only selected Alpaca Paper-tradable US equities may be added to a bot. Removing one here immediately removes it from every bot; enabling it later never restores prior assignments.</p></div><button type="button" className="secondaryButton" onClick={() => void sync()} disabled={syncing}>{syncing ? "Synchronizing…" : "Sync Alpaca assets"}</button></div><p className="muted assetUniverseNotice">{notice}</p>{renderList("Selected assets", true, selectedSearch, setSelectedSearch, selected)}{renderList("Available assets", false, availableSearch, setAvailableSearch, available)}</section>;
}
