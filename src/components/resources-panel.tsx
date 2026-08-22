"use client";

import { useState } from "react";
import { resourceCategories, type ResourceCategory } from "@/modules/resources/resource-policy";

export type ResourceView = { id: string; name: string; category: string; url: string; hostname: string; active: boolean; autoActivated: boolean; reviewStatus: string; refreshMinutes: number; lastFetchedAt: string | null; nextRefreshAt: string | null; lastError: string | null; updatedAt: string; snapshots: Array<{ id: string; canonicalUrl: string; title: string; contentHash: string; excerpt: string; summary: string | null; relevance: string; fetchedAt: string }> };
export type BriefView = { id: string; marketDate: string; status: string; generatedAt: string; resources: Array<{ source: string; title: string; hash: string }>; botInputs: Array<{ bot: string; template: string; recommendations: string[] }> };
type ResourceDraft = { url: string; category: ResourceCategory };
type ResourceModal = { mode: "new" } | { mode: "edit"; source: ResourceView } | null;

function dateTime(value: string | null) { return value ? new Date(value).toLocaleString() : "Not read yet"; }
export function resourceFormDraft(source?: ResourceView): ResourceDraft { return { url: source?.url ?? "", category: (source?.category as ResourceCategory | undefined) ?? "NEWS" }; }

export function ResourcesPanel({ initialSources, initialBriefs }: { initialSources: ResourceView[]; initialBriefs: BriefView[] }) {
  const [sources, setSources] = useState(initialSources);
  const [modal, setModal] = useState<ResourceModal>(null);
  const [draft, setDraft] = useState<ResourceDraft>(resourceFormDraft());
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  function openNew() { setDraft(resourceFormDraft()); setModal({ mode: "new" }); }
  function openEdit(source: ResourceView) { setDraft(resourceFormDraft(source)); setModal({ mode: "edit", source }); }
  function closeModal() { if (!saving) setModal(null); }

  async function saveResource(event: React.FormEvent) {
    event.preventDefault();
    if (!modal || saving) return;
    setSaving(true); setNotice(null);
    try {
      const edit = modal.mode === "edit";
      const response = await fetch("/api/resources", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit ? { id: modal.source.id, ...draft } : draft) });
      const payload = await response.json() as { error?: string; source?: { id: string; active: boolean; reviewStatus: string }; id?: string; name?: string; url?: string; hostname?: string; category?: string; active?: boolean; autoActivated?: boolean; reviewStatus?: string; lastFetchedAt?: string | null; nextRefreshAt?: string | null; lastError?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "RESOURCE_SAVE_FAILED");
      if (edit) {
        setSources((current) => current.map((source) => source.id === modal.source.id ? { ...source, name: payload.name ?? source.name, url: payload.url ?? source.url, hostname: payload.hostname ?? source.hostname, category: payload.category ?? source.category, active: payload.active ?? source.active, autoActivated: payload.autoActivated ?? source.autoActivated, reviewStatus: payload.reviewStatus ?? source.reviewStatus, lastFetchedAt: payload.lastFetchedAt ?? null, nextRefreshAt: payload.nextRefreshAt ?? null, lastError: payload.lastError ?? null } : source));
        setNotice("Resource updated. A changed URL is reviewed again before refresh.");
      } else setNotice("Resource submitted. Refresh this page to see its review state.");
      setModal(null);
    } catch { setNotice("The resource could not be saved. Use a public HTTPS URL."); }
    finally { setSaving(false); }
  }

  async function setActive(source: ResourceView, active: boolean) {
    const response = await fetch("/api/resources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: source.id, active }) });
    if (!response.ok) { setNotice("The resource status could not be updated."); return; }
    const payload = await response.json() as { active: boolean; reviewStatus: string };
    setSources((current) => current.map((item) => item.id === source.id ? { ...item, active: payload.active, reviewStatus: payload.reviewStatus } : item));
  }

  const visible = sources.filter((source) => `${source.name} ${source.category} ${source.hostname}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="resourcesPanel">
    <header className="resourcesHeading"><div><p className="eyebrow">ADMIN RESOURCE LIBRARY</p><h1>Resources</h1><p className="pageLead">Trusted market context, reviewed at the source. Links stay untrusted input; no files or credentials are stored.</p></div><button type="button" className="headerAction" onClick={openNew}>New resource</button></header>
    <section className="resourceToolbar"><label className="resourceSearch"><span>Search library</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, category, or domain" /></label><p><strong>{visible.length}</strong> of {sources.length} sources</p></section>
    {notice && <p className="resourceNotice" role="status">{notice}</p>}
    <div className="resourceGrid">{visible.map((source) => <article className="resourceCard" key={source.id}>
      <div className="resourceCardHeading"><div><p className="eyebrow">{source.category.replace("_", " ")}</p><h2>{source.name}</h2><a href={source.url} target="_blank" rel="noreferrer">{source.hostname} <span aria-hidden="true">↗</span></a></div><span className={source.active ? "resourceState active" : "resourceState"}>{source.active ? "Active" : source.reviewStatus}</span></div>
      <dl><div><dt>Last read</dt><dd>{dateTime(source.lastFetchedAt)}</dd></div><div><dt>Next refresh</dt><dd>{dateTime(source.nextRefreshAt)}</dd></div><div><dt>Frequency</dt><dd>{source.refreshMinutes} min</dd></div></dl>
      {source.lastError && <p className="fieldError">Last safe extraction error: {source.lastError}</p>}
      <div className="resourceActions"><div><button type="button" className="secondaryButton" onClick={() => openEdit(source)}>Edit</button><button type="button" className={source.active ? "textDangerButton" : "secondaryButton"} onClick={() => void setActive(source, !source.active)}>{source.active ? "Pause" : "Activate"}</button></div><small>{source.autoActivated ? "Trusted registry domain" : "Review required"}</small></div>
      {source.snapshots[0] && <details><summary>Latest captured evidence</summary><p><strong>{source.snapshots[0].title}</strong> · {dateTime(source.snapshots[0].fetchedAt)}</p><p>{source.snapshots[0].summary ?? source.snapshots[0].excerpt}</p><small>Hash: {source.snapshots[0].contentHash}</small></details>}
    </article>)}</div>
    {visible.length === 0 && <div className="resourceEmpty"><strong>No matching resources</strong><p>Try a broader search or add a public HTTPS source.</p></div>}
    <section className="resourceBriefs"><p className="eyebrow">IMMUTABLE PRE-MARKET BRIEFINGS</p><h2>Briefing history</h2>{initialBriefs.length ? initialBriefs.map((brief) => <details key={brief.id}><summary>{new Date(brief.marketDate).toLocaleDateString()} · {brief.resources.length} cited snapshots · {brief.botInputs.length} bot inputs · {brief.status}</summary><p>Generated {dateTime(brief.generatedAt)}. This briefing may block or defer a candidate only; it cannot create a trade or relax a control.</p><ul>{brief.resources.map((resource) => <li key={`${brief.id}-${resource.hash}`}>{resource.source}: {resource.title} <small>{resource.hash}</small></li>)}</ul>{brief.botInputs.length > 0 && <div className="briefBotInputs"><strong>Bot recommendations</strong>{brief.botInputs.map((input) => <article key={`${brief.id}-${input.bot}`}><p><strong>{input.bot}</strong> <small>{input.template}</small></p><ul>{input.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul></article>)}</div>}</details>) : <p className="muted">The first exchange-day briefing will appear after the 08:30 ET worker run.</p>}</section>
    {modal && <div className="modalOverlay" role="presentation" onMouseDown={closeModal}><section className="modalCard resourceModal" role="dialog" aria-modal="true" aria-labelledby="resource-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modalHeading"><div><p className="eyebrow">{modal.mode === "new" ? "NEW RESOURCE" : "EDIT RESOURCE"}</p><h2 id="resource-modal-title">{modal.mode === "new" ? "Review a public link" : modal.source.name}</h2></div><button type="button" className="iconButton" onClick={closeModal} aria-label="Close">×</button></div><form className="resourceModalForm" onSubmit={saveResource}><p className="muted">Only public HTTPS pages are accepted. Changing a URL performs a new trust review and clears previous refresh state.</p><label>Public URL<input type="url" required placeholder="https://example.com/article" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} /></label><label>Category<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as ResourceCategory }))}>{resourceCategories.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label><div className="modalFormActions"><button type="button" className="secondaryButton" onClick={closeModal}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : modal.mode === "new" ? "Review link" : "Save changes"}</button></div></form></section></div>}
  </section>;
}
