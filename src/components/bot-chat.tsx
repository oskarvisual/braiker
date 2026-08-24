"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAutoResizingComposer } from "@/components/auto-resizing-composer";

type Message = { id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; content: string; createdAt: string };
type Session = { id: string; title: string; kind: "CONVERSATION" | "MANAGER_NOTE"; createdAt: string; updatedAt: string };
type Payload = { active: boolean; sessions: Session[]; selectedSessionId: string | null; messages: Message[]; hasMore: boolean; nextCursor: string | null };
export type BotChatContextRequest = { key: string; title: string; content: string; focus: { kind: "ORDER" | "SCAN"; id: string } };

/** Local-only contextual chat. It is deliberately not a Telegram surface. */
export function BotChat({ botId, botName, active: initialActive, compact = false, contextRequest }: { botId: string; botName: string; active?: boolean; compact?: boolean; contextRequest?: BotChatContextRequest | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const handledContextRequest = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const stickToLatestRef = useRef(true);
  const restoreScrollHeightRef = useRef<number | null>(null);
  const active = data?.active ?? initialActive ?? false;
  const composerRef = useAutoResizingComposer(draft);

  async function load(sessionId?: string | null) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const response = await fetch(`/api/bots/${botId}/chat${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new Error("BOT_CHAT_UNAVAILABLE");
    const next = await response.json() as Payload;
    setData(next);
    setSelectedSessionId(next.selectedSessionId);
    stickToLatestRef.current = true;
    setLoadFailed(false);
  }

  async function loadOlder() {
    if (!data?.hasMore || !data.nextCursor || !selectedSessionId || loadingOlder) return;
    const container = messagesRef.current;
    if (!container) return;
    const beforeHeight = container.scrollHeight;
    setLoadingOlder(true);
    try {
      const response = await fetch(`/api/bots/${botId}/chat?sessionId=${encodeURIComponent(selectedSessionId)}&before=${encodeURIComponent(data.nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("BOT_CHAT_HISTORY_UNAVAILABLE");
      const older = await response.json() as Payload;
      restoreScrollHeightRef.current = beforeHeight;
      stickToLatestRef.current = false;
      setData((current) => current ? { ...current, messages: [...older.messages, ...current.messages], hasMore: older.hasMore, nextCursor: older.nextCursor } : current);
    } finally { setLoadingOlder(false); }
  }

  useEffect(() => {
    setData(null); setLoadFailed(false);
    void load().catch(() => setLoadFailed(true));
  }, [botId]);

  useEffect(() => {
    if (!contextRequest || !data || !active || sending || handledContextRequest.current === contextRequest.key) return;
    handledContextRequest.current = contextRequest.key;
    setSending(true);
    void fetch(`/api/bots/${botId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ASK_CONTEXT", title: contextRequest.title, content: contextRequest.content, focus: contextRequest.focus }) })
      .then(async (response) => {
        const payload = await response.json() as { session?: Session };
        if (!response.ok || !payload.session) throw new Error("BOT_CHAT_CONTEXT_FAILED");
        await load(payload.session.id);
      })
      .catch(() => undefined)
      .finally(() => setSending(false));
  }, [active, botId, contextRequest, data, sending]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    if (restoreScrollHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - restoreScrollHeightRef.current;
      restoreScrollHeightRef.current = null;
      return;
    }
    if (stickToLatestRef.current) container.scrollTop = container.scrollHeight;
  }, [selectedSessionId, data?.messages.length]);

  async function createSession() {
    if (!active || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/bots/${botId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CREATE_SESSION", title: "New conversation" }) });
      const payload = await response.json() as { session?: Session };
      if (!response.ok || !payload.session) throw new Error("BOT_CHAT_SESSION_FAILED");
      await load(payload.session.id);
    } finally { setSending(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !selectedSessionId || !active) return;
    setDraft(""); setSending(true); stickToLatestRef.current = true;
    const optimistic: Message = { id: `local-${Date.now()}`, role: "USER", content, createdAt: new Date().toISOString() };
    setData((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    try {
      const response = await fetch(`/api/bots/${botId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: selectedSessionId, content }) });
      const payload = await response.json() as { reply?: string; addedToDailyContext?: boolean };
      if (!response.ok || !payload.reply) throw new Error("BOT_CHAT_MESSAGE_FAILED");
      setData((current) => current ? { ...current, messages: [...current.messages, { id: `reply-${Date.now()}`, role: "ASSISTANT", content: `${payload.reply}${payload.addedToDailyContext ? "\n\nAdded as cautious context for today only." : ""}`, createdAt: new Date().toISOString() }] } : current);
    } catch {
      await load(selectedSessionId).catch(() => undefined);
    } finally { setSending(false); }
  }

  if (loadFailed && !data) return <section className="botChatLocked botChatUnavailable" role="alert"><p className="eyebrow">LOCAL BOT CHAT</p><h3>Chat is temporarily unavailable</h3><p>The bot state was not changed. Reload this view and try again; if the issue continues, check the worker and database status.</p></section>;
  if (!active) return <section className="botChatLocked"><p className="eyebrow">LOCAL BOT CHAT</p><h3>Chat is locked while this bot is OFF</h3><p>Turn the bot on first. Individual chats cannot place orders or change capital, risk, instructions, Kill Switch, or bot power.</p></section>;

  return <section className={`botChat ${compact ? "botChatCompact" : ""}`}>
    {!compact && <header className="managerChatHeading"><div><p className="eyebrow">LOCAL BOT CHAT</p><h1>{botName}</h1><p className="intro">Ask about this bot’s analysis. Start a message with <strong>Important:</strong> only to add cautious context for today; it can never issue an order or relax a control.</p></div></header>}
    <div className="managerChatLayout botChatLayout">
      <aside className="managerChatSidebar"><div className="managerChatSidebarTitle"><span>Sessions</span><button type="button" className="inlineAction" onClick={() => void createSession()} disabled={sending}>New</button></div><small>Context and notes for this bot.</small><div className="managerSessionList">{data?.sessions.map((session) => <button key={session.id} type="button" className={`managerSession ${selectedSessionId === session.id ? "selected" : ""}`} onClick={() => void load(session.id)}><strong>{session.title}</strong><small>{session.kind === "MANAGER_NOTE" ? "Bot Manager note" : "Private conversation"}</small></button>)}</div></aside>
      <div className="managerConversation"><header className="managerConversationHeader"><div><p className="eyebrow">{data?.sessions.find((session) => session.id === selectedSessionId)?.kind === "MANAGER_NOTE" ? "MANAGER NOTE" : "CONTEXTUAL SESSION"}</p><h2>{data?.sessions.find((session) => session.id === selectedSessionId)?.title ?? "Choose or create a session"}</h2></div><span>Paper-only</span></header><div className="managerMessages" ref={messagesRef} onScroll={(event) => { const container = event.currentTarget; stickToLatestRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 48; if (container.scrollTop < 32) void loadOlder(); }}>{loadingOlder && <p className="chatHistoryLoading">Loading earlier messages…</p>}{data?.messages.length ? data.messages.map((message) => <article key={message.id} className={`managerMessage ${message.role.toLowerCase()}`}><small>{message.role === "USER" ? "You" : message.role === "SYSTEM" ? "Bot Manager" : botName}</small><p>{message.content}</p></article>) : <div className="managerEmpty"><strong>No messages yet.</strong><p>Create a local session to ask why {botName} analyzed, rejected, or traded an opportunity.</p></div>}</div><form className="managerComposer" onSubmit={submit}><label htmlFor={`bot-chat-message-${botId}`}>Message {botName}</label><div><textarea ref={composerRef} id={`bot-chat-message-${botId}`} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} disabled={sending || !selectedSessionId} placeholder="Why did you skip this opportunity?" /><button type="submit" disabled={sending || !draft.trim() || !selectedSessionId}>{sending ? "Thinking…" : "Send"}</button></div><small>Use “Important: …” for a cautious, day-only note. It may defer a candidate, never create one.</small></form></div>
    </div>
  </section>;
}
