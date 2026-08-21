import { z } from "zod";

const outcomesSchema = z.array(z.object({
  symbol: z.string().min(1).max(16),
  outcome: z.string().min(1).max(32),
  message: z.string().min(1).max(500)
}));

type PersistedScan = {
  id: string;
  status: string;
  reason: string;
  message: string;
  outcomes: unknown;
  startedAt: Date;
  completedAt: Date | null;
};

/** Converts durable scan rows into the intentionally limited API representation. */
export function presentBotScanRun(scan: PersistedScan) {
  return {
    id: scan.id,
    status: scan.status,
    reason: scan.reason,
    message: scan.message,
    outcomes: outcomesSchema.safeParse(scan.outcomes).data ?? [],
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null
  };
}
