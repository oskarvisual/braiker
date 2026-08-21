import type { StrategySignal } from "@/modules/domain/contracts";

export function holdSignal(reason = "No approved deterministic strategy is enabled"): StrategySignal {
  return { action: "HOLD", confidence: 0, reason, payload: { strategy: "hold" } };
}
