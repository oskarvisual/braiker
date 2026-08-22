"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";

export type ManagerMessage = { id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; source: "WEB" | "TELEGRAM" | "TELEGRAM_ALERT" | "SYSTEM"; content: string; createdAt: string };
export type ManagerSession = { id: string; title: string; kind: "OPERATIONS" | "CONVERSATION"; pinned: boolean; updatedAt: string; messages: ManagerMessage[] };
export type ManagerActionProposal = { id: string; botName: string; action: "TURN_ON" | "TURN_OFF"; expiresAt: string };

function labelForSource(source: ManagerMessage["source"]) {
  if (source === "TELEGRAM_ALERT") return "Telegram alert";
  if (source === "TELEGRAM") return "Telegram";
  if (source === "SYSTEM") return "BrAIker";
  return "You";
}

export function synchronizeManagerSessions(selectedId: string, sessions: ManagerSession[]) {
  return {
    sessions,
    selectedId: sessions.some((session) => session.id === selectedId) ? selectedId : sessions[0]?.id ?? ""
  };
}

export function managerActionSummary(proposal: ManagerActionProposal) {
  const operation = proposal.action === "TURN_ON" ? "turn ON" : "turn OFF";
  return `This will ${operation} ${proposal.botName} in Paper mode. BrAIker will revalidate permissions, lifecycle state, risk status, and the Kill Switch when you confirm.`;
}

export function ManagerChat({ initialSessions, initialActionProposals = [] }: { initialSessions: ManagerSession[]; initialActionProposals?: ManagerActionProposal[] }) {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState(initialSessions[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionProposals, setActionProposals] = useState(initialActionProposals);
  const selected = useMemo(() => sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null, [sessions, selectedId]);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/manager/sessions", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json() as { sessions?: ManagerSession[]; actionProposals?: ManagerActionProposal[]; error?: string };
    if (!response.ok || !payload.sessions) throw new Error(payload.error ?? "MANAGER_SESSION_LIST_FAILED");

    setSessions(payload.sessions);
    setSelectedId((current) => synchronizeManagerSessions(current, payload.sessions ?? []).selectedId);
    setActionProposals(payload.actionProposals ?? []);
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (sending || document.visibilityState === "hidden") return;
      void refreshSessions().catch(() => undefined);
    };

    refreshWhenVisible();
    const intervalId = window.setInterval(refreshWhenVisible, 5_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshSessions, sending]);

  async function createConversation() {
    setCreating(true);
    try {
      const response = await fetch("/api/manager/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New conversation" }) });
      const payload = await response.json() as { session?: ManagerSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "MANAGER_SESSION_CREATE_FAILED");
      setSessions((current) => [...current, payload.session!]);
      setSelectedId(payload.session.id);
    } catch {
      pushToast({ tone: "error", title: "Conversation could not be created", message: "Please try again." });
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selected || sending) return;
    const localMessage: ManagerMessage = { id: `local-${Date.now()}`, role: "USER", source: "WEB", content, createdAt: new Date().toISOString() };
    setDraft("");
    setSending(true);
    setSessions((current) => current.map((session) => session.id === selected.id ? { ...session, messages: [...session.messages, localMessage], updatedAt: localMessage.createdAt } : session));
    try {
      const response = await fetch(`/api/manager/sessions/${selected.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
      const payload = await response.json() as { reply?: string; error?: string; actionProposal?: ManagerActionProposal };
      if (!response.ok || !payload.reply) throw new Error(payload.error ?? "MANAGER_MESSAGE_FAILED");
      const reply: ManagerMessage = { id: `reply-${Date.now()}`, role: "ASSISTANT", source: "SYSTEM", content: payload.reply, createdAt: new Date().toISOString() };
      setSessions((current) => current.map((session) => session.id === selected.id ? { ...session, messages: [...session.messages, reply], updatedAt: reply.createdAt } : session));
      if (payload.actionProposal) setActionProposals((current) => [payload.actionProposal!, ...current.filter((proposal) => proposal.id !== payload.actionProposal!.id)]);
      await refreshSessions();
    } catch {
      pushToast({ tone: "error", title: "BrAIker could not answer", message: "No trading action was taken. Try again after checking AI status." });
    } finally {
      setSending(false);
    }
  }

  async function confirmAction(actionProposal: ManagerActionProposal) {
    try {
      const response = await fetch(`/api/manager/actions/${actionProposal.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" } });
      const payload = await response.json() as { runMode?: string; error?: string };
      if (!response.ok || !payload.runMode) throw new Error(payload.error ?? "MANAGER_ACTION_CONFIRMATION_FAILED");
      pushToast({ tone: "success", title: `${actionProposal.botName} updated`, message: payload.runMode === "PAPER_ACTIVE" ? "The bot is ON and remains Paper-only." : "The bot is OFF and its Kill Switch is engaged." });
      setActionProposals((current) => current.filter((proposal) => proposal.id !== actionProposal.id));
      await refreshSessions();
    } catch {
      pushToast({ tone: "error", title: "Proposal could not be confirmed", message: "It may have expired, been used, or no longer be safe to apply." });
      setActionProposals((current) => current.filter((proposal) => proposal.id !== actionProposal.id));
      await refreshSessions().catch(() => undefined);
    }
  }

  return <section className="managerChat">
    <header className="managerChatHeading">
      <div><p className="eyebrow">OPERATIONS ASSISTANT · CONFIRMATION REQUIRED</p><h1>Br<span>AI</span>ker</h1><p className="intro">Ask for explanations, or explicitly request “activate bot Name” / “turn off Name”. BrAIker prepares a Paper-only proposal and never applies it without your confirmation.</p></div>
      <button type="button" className="managerNewConversation" onClick={createConversation} disabled={creating}>{creating ? "Creating…" : "New chat"}</button>
    </header>
    <div className="managerChatLayout">
      <aside className="managerChatSidebar" aria-label="Bot Manager conversations">
        <div className="managerChatSidebarTitle"><strong>Conversations</strong></div>
        <div className="managerSessionList">
          {sessions.map((session) => <button key={session.id} type="button" className={`managerSession ${selected?.id === session.id ? "selected" : ""}`} onClick={() => setSelectedId(session.id)}>
            <strong>{session.pinned ? "📌 " : ""}{session.title}</strong><small>{session.kind === "OPERATIONS" ? "Telegram alerts and operations" : "Manual conversation"}</small>
          </button>)}
        </div>
      </aside>
      <section className="managerConversation" aria-live="polite">
        {selected ? <>
          <div className="managerConversationHeader"><div><p className="eyebrow">{selected.pinned ? "PINNED OPERATIONS SESSION" : "BOT MANAGER CHAT"}</p><h2>{selected.title}</h2></div><span>Confirmation required</span></div>
          <div className="managerMessages">
            {selected.messages.length ? selected.messages.map((message) => <article className={`managerMessage ${message.role.toLowerCase()}`} key={message.id}><small>{labelForSource(message.source)}</small><p>{message.content}</p></article>) : <div className="managerEmpty"><strong>Start an operational conversation.</strong><p>Ask BrAIker to explain the latest activity, risk decisions, or prepare an explicit ON/OFF proposal.</p></div>}
          </div>
          {actionProposals.map((actionProposal) => <aside className="managerActionProposal" aria-live="polite" key={actionProposal.id}><p className="eyebrow">PENDING POWER CHANGE</p><strong>{actionProposal.action === "TURN_ON" ? "Turn ON" : "Turn OFF"} · {actionProposal.botName}</strong><p>{managerActionSummary(actionProposal)}</p><div><small>Expires {new Date(actionProposal.expiresAt).toLocaleTimeString()}</small><button type="button" onClick={() => void confirmAction(actionProposal)}>Confirm change</button></div></aside>)}
          <form className="managerComposer" onSubmit={sendMessage}>
            <label htmlFor="manager-message">Message BrAIker</label>
            <div><textarea id="manager-message" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="Why did the latest scan skip a trade?" disabled={sending} /><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Thinking…" : "Send"}</button></div>
            <small>BrAIker can explain information and prepare explicit ON/OFF proposals. It cannot trade, alter capital, risk limits, users, secrets, or settings from chat.</small>
          </form>
        </> : <div className="managerEmpty"><strong>No conversations yet.</strong></div>}
      </section>
    </div>
  </section>;
}
