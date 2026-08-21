const baseUrl = process.env.BRAIKER_URL ?? "http://localhost:3000";

async function check(path) {
  const response = await fetch(new URL(path, baseUrl));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

try {
  const [health, readiness] = await Promise.all([check("/api/health"), check("/api/ready")]);
  if (health.mode !== "paper") throw new Error(`Expected paper mode, got ${health.mode ?? "unknown"}`);
  if (readiness.database !== "connected") throw new Error("MySQL is not ready");
  console.log(`Paper soak preflight passed for ${baseUrl}: web is healthy, MySQL is connected, mode is paper.`);
  console.log("Verify the single worker heartbeat and perform a manual dashboard sync before enabling bots.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Paper soak preflight failed");
  process.exit(1);
}
