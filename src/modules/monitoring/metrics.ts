import { Registry, collectDefaultMetrics, Counter, Gauge } from "prom-client";

export const metrics = new Registry();
collectDefaultMetrics({ register: metrics, prefix: "braiker_" });
export const workerHeartbeat = new Gauge({ name: "braiker_worker_heartbeat_timestamp_ms", help: "Unix timestamp of the last worker heartbeat", registers: [metrics] });
export const riskRejections = new Counter({ name: "braiker_risk_rejections_total", help: "Rejected proposals by reason", labelNames: ["reason"], registers: [metrics] });
