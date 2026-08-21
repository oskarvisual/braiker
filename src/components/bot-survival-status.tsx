import type { BotSurvivalState } from "@/modules/bots/survival-state";

const moodEmoji: Record<BotSurvivalState["code"], string> = {
  THRIVING: "😄",
  STABLE: "🙂",
  CAUTIOUS: "🤔",
  STRESSED: "😰",
  CRITICAL: "😟",
  DEAD: "☠️",
  CALIBRATING: "🧭"
};

export function survivalMoodEmoji(code: BotSurvivalState["code"]) {
  return moodEmoji[code];
}

export function BotSurvivalStatus({ state, compact = false }: { state: BotSurvivalState; compact?: boolean }) {
  return <span className={`survivalStatus ${state.tone} ${compact ? "compact" : ""}`} title={state.summary}><i className="survivalEmoji" aria-hidden="true">{survivalMoodEmoji(state.code)}</i><span><strong>{state.label}</strong>{!compact && <small>{state.summary}</small>}</span></span>;
}
