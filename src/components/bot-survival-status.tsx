import type { BotSurvivalState } from "@/modules/bots/survival-state";
import styles from "./bot-survival-status.module.css";

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
  return <span className={`survivalStatus ${state.tone} ${compact ? "compact" : ""}`} title={state.summary}><span className={styles.emoji} aria-hidden="true">{survivalMoodEmoji(state.code)}</span><span><strong>{state.label}</strong>{!compact && <small>{state.summary}</small>}</span></span>;
}
