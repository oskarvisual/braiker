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
  if (compact) {
    return <span className={`survivalStatus ${state.tone} compact`} title={state.summary}><span className={styles.emoji} aria-hidden="true">{survivalMoodEmoji(state.code)}</span><span><strong>{state.label}</strong></span></span>;
  }

  const score = state.score;
  const hasScore = score !== null;
  return <div className={`survivalStatus ${state.tone} ${styles.full}`}>
    <div className={styles.heading}>
      <span className={styles.emoji} aria-hidden="true">{survivalMoodEmoji(state.code)}</span>
      <div><p className={styles.title}>Survival is informational</p><strong className={styles.label}>{state.label}</strong></div>
    </div>
    <div className={styles.health}>
      <div className={styles.scoreLine}><span>Survival</span><strong>{hasScore ? score : "—"}<small>/100</small></strong></div>
      {hasScore
        ? <div className={styles.progress} role="progressbar" aria-label="Bot survival health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{ width: `${score}%` }} /></div>
        : <div className={`${styles.progress} ${styles.unscored}`} role="status" aria-label="Bot survival health is awaiting first analysis" />}
      <p className={styles.operationalStatus}>{state.operationalStatus}</p>
      <p className={styles.summary}>{state.summary}</p>
    </div>
  </div>;
}
