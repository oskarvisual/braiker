"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";

export type ManagerMessage = { id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; source: "WEB" | "TELEGRAM" | "TELEGRAM_ALERT" | "SYSTEM"; content: string; createdAt: string };
export type ManagerSession = { id: string; title: string; kind: "OPERATIONS" | "CONVERSATION"; pinned: boolean; updatedAt: string; messages: ManagerMessage[] };

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

/** The Manager is intentionally conversational but read-only: no chat action can operate trading controls. */
export function ManagerChat({ initialSessions }: { initialSessions: ManagerSession[] }) {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState(initialSessions[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const selected = useMemo(() => sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null, [sessions, selectedId]);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/manager/sessions", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json() as { sessions?: ManagerSession[]; error?: string };
    if (!response.ok || !payload.sessions) throw new Error(payload.error ?? "MANAGER_SESSION_LIST_FAILED");

    setSessions(payload.sessions);
    setSelectedId((current) => synchronizeManagerSessions(current, payload.sessions ?? []).selectedId);
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
      const payload = await response.json() as { reply?: string; error?: string };
      if (!response.ok || !payload.reply) throw new Error(payload.error ?? "MANAGER_MESSAGE_FAILED");
      const reply: ManagerMessage = { id: `reply-${Date.now()}`, role: "ASSISTANT", source: "SYSTEM", content: payload.reply, createdAt: new Date().toISOString() };
      setSessions((current) => current.map((session) => session.id === selected.id ? { ...session, messages: [...session.messages, reply], updatedAt: reply.createdAt } : session));
      await refreshSessions();
    } catch {
      pushToast({ tone: "error", title: "BrAIker could not answer", message: "No trading action was taken. Try again after checking AI status." });
    } finally {
      setSending(false);
    }
  }

  return <section className="managerChat">
    <header className="managerChatHeading">
      <div><p className="eyebrow">READ-ONLY OPERATIONS ASSISTANT</p><h1>Br<span>AI</span>ker</h1><p className="intro">Ask for explanations of scans, decisions, orders, bot health, or paper-account activity. This assistant cannot trade or change any control.</p></div>
      <button type="button" className="managerNewConversation" onClick={createConversation} disabled={creating}>{creating ? "Creating…" : "New chat"}</button>
    </header>
    <div className="managerChatLayout">
      <aside className="managerChatSidebar" aria-label="Bot Manager conversations">
        <div className="managerChatSidebarTitle"><strong>Conversations</strong><span>Read-only</span></div>
        <div className="managerSessionList">
          {sessions.map((session) => <button key={session.id} type="button" className={`managerSession ${selected?.id === session.id ? "selected" : ""}`} onClick={() => setSelectedId(session.id)}>
            <strong>{session.pinned ? "📌 " : ""}{session.title}</strong><small>{session.kind === "OPERATIONS" ? "Telegram alerts and operations" : "Manual conversation"}</small>
          </button>)}
        </div>
      </aside>
      <section className="managerConversation" aria-live="polite">
        {selected ? <>
          <div className="managerConversationHeader"><div><p className="eyebrow">{selected.pinned ? "PINNED OPERATIONS SESSION" : "BOT MANAGER CHAT"}</p><h2>{selected.title}</h2></div><span>Read-only</span></div>
          <div className="managerMessages">
            {selected.messages.length ? selected.messages.map((message) => <article className={`managerMessage ${message.role.toLowerCase()}`} key={message.id}><small>{labelForSource(message.source)}</small><p>{message.content}</p></article>) : <div className="managerEmpty"><strong>Start a read-only conversation.</strong><p>Ask BrAIker to explain the latest activity, risk decisions, or a bot's survival status.</p></div>}
          </div>
          <form className="managerComposer" onSubmit={sendMessage}>
            <label htmlFor="manager-message">Message BrAIker</label>
            <div><textarea id="manager-message" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="Why did the latest scan skip a trade?" disabled={sending} /><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Thinking…" : "Send"}</button></div>
            <small>BrAIker can explain available information only. It cannot execute trades or change settings.</small>
          </form>
        </> : <div className="managerEmpty"><strong>No conversations yet.</strong></div>}
      </section>
    </div>
  </section>;
}
