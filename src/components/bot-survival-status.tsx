import type { BotSurvivalState } from "@/modules/bots/survival-state";

function SurvivalIcon({ code }: { code: BotSurvivalState["code"] }) {
  if (code === "THRIVING") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Zm6.3 11.5.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4ZM5.5 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" /></svg>;
  if (code === "CALIBRATING") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>;
  if (code === "CAUTIOUS") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  if (code === "STRESSED") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>;
  if (code === "CRITICAL") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>;
  if (code === "DEAD") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m8.7 8.7 6.6 6.6m0-6.6-6.6 6.6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.9 7.7 7 10 4.1-2.3 7-5.5 7-10V6l-7-3Z" /><path d="m8.8 12 2.1 2.1 4.3-4.3" /></svg>;
}

export function BotSurvivalStatus({ state, compact = false }: { state: BotSurvivalState; compact?: boolean }) {
  return <span className={`survivalStatus ${state.tone} ${compact ? "compact" : ""}`} title={state.summary}><i><SurvivalIcon code={state.code} /></i><span><strong>{state.label}</strong>{!compact && <small>{state.summary}</small>}</span></span>;
}
