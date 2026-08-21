# BrAIker architecture and implementation guide

## Runtime topology

```text
Browser
  └─ Next.js web app + authenticated API
       └─ MySQL 8 (Prisma)

Node worker
  ├─ node-cron tickers
  ├─ MySQL-backed task leases
  ├─ Alpaca Paper reconciliation
  └─ future execution-job processing
       └─ Alpaca Paper REST API
```

Docker Compose is intentionally limited to `web` and `worker`. MySQL is external and configured by `DATABASE_URL`; do not add a database container unless the user explicitly changes that deployment decision.

## Web and worker responsibilities

| Component | Owns | Must not do |
| --- | --- | --- |
| Web | UI, session auth, RBAC, configuration APIs, read models, manual sync trigger | expose credentials, open broker WebSockets, create an execution side effect from the browser |
| Worker | bootstrap Admin, scheduler leases, reconciliation, worker heartbeat, future market stream and execution jobs | run with live configuration, bypass risk checks, trust browser input as authorization |
| MySQL | durable domain state, audit state, schedules, leases, snapshots, encrypted connection fields | contain plaintext broker secrets |

## Scheduler

`node-cron` is only a wake-up mechanism. Database tables hold the durable schedule/job truth.

- `scheduled_tasks`: named task, cron, timezone, enabled state, recovery policy.
- `job_runs`: run identity, attempts, leases, timestamps, errors.
- Lease recovery runs every minute.
- Portfolio reconciliation is provisioned every five minutes by default and can be changed in Settings.
- The worker processes one execution job every 30 seconds; no UI currently creates proposals/jobs automatically.

Workers claim recoverable work with conditional MySQL updates. Never replace this with an in-memory-only scheduler, system cron, Redis, or an untracked queue.

## Persistence conventions

- MySQL 8+, InnoDB, `utf8mb4`, UTC.
- UUIDs are `CHAR(36)` for traceability.
- Dates are `DATETIME(3)` in UTC.
- Monetary quantities/prices are `DECIMAL(28,12)`.
- JSON is for immutable/request snapshots, metadata, policy/profile payloads, or broker data; it is not an authorization shortcut.
- Prisma owns the dedicated BrAIker schema and migrations.

### Important model groups

| Domain | Primary models |
| --- | --- |
| Identity | `User`, `Session`, `WalletMember`, `AuditLog` |
| Wallet/broker | `Wallet`, `BrokerConnection` |
| Bots | `BotInstance` (including optional `cloneSourceId` lineage), `BotCapitalEvent`, `BotMemoryEntry`, `BotModeTransition`, `BotStateTransition`, `Watchlist` |
| Market/decision | `MarketBar`, `MarketSnapshot`, `MarketStreamEvent`, `StrategySignal`, `AiDecision`, `TradeProposal`, `RiskDecision` |
| Execution/portfolio | `ExecutionJob`, `Order`, `Fill`, `Position`, `BrokerOrderSnapshot`, `PortfolioSnapshot`, `DailyPerformance`, `ReconciliationRun` |
| Operations | `ScheduledTask`, `JobRun`, `SystemEvent`, `ErrorEvent`, `NotificationSettings` |

Before changing the schema, inspect `prisma/schema.prisma` and use an additive, versioned migration. Do not point destructive tests to the local development database.

## Authentication and authorization

- Sessions are opaque, hashed tokens stored in MySQL and carried via secure cookies.
- Global roles: `ADMIN`, `OPERATOR`, `VIEWER`.
- Wallet membership adds wallet-specific roles. All wallet resources must check membership (Admins are the only cross-wallet administrative exception where implemented).
- `VIEWER` can read only; configuration and bot setup are Admin-only today.
- Every modifying API endpoint verifies same origin and authenticated authorization.

Do not infer permission from a wallet/bot UUID supplied by a request.

## Broker credential handling

`BrokerConnection` fields are encrypted independently (ciphertext, IV, tag, key version) using AES-256-GCM. The master encryption key is `APP_ENCRYPTION_KEY` and stays in environment/secrets storage.

The worker and server-side sync code can decrypt only when required. Browser responses expose configuration status, never API key or secret values. Webhook destinations use the same AES-256-GCM storage pattern through `NotificationSettings`; the browser gets only whether a destination is configured, never its URL.

## Bot state rules

Public UI uses only ON/OFF. Internal mappings:

```text
TURN_ON  → runMode PAPER_ACTIVE, killSwitch false, status RUNNING
TURN_OFF → runMode OFF,          killSwitch true,  status PAUSED
```

Activation fails for a dead bot, a halted/error/maintenance bot, or a bot with a retained kill switch. Several independently funded bots may be active in the same wallet. Death is immutable. These must remain negative tests.

Current implementation caveat: `botLifeStatus()` defines zero capital as `DEAD` and all dead-state guards are in place, but the automatic persistence of that state during future capital accounting is not yet implemented. Add it before any automated capital-changing execution flow is enabled.

The Prisma `BotRunMode.SIMULATION` value is a historical compatibility value. It is not an allowed new control action and should only be handled safely as inactive legacy data.

## APIs and pages

| Area | Endpoints / page | Notes |
| --- | --- | --- |
| Auth | `/login`, `/api/auth/*`, `/account/password` | session and password lifecycle |
| Dashboard | `/`, `/api/dashboard/overview`, `/api/dashboard/sync` | sync is Admin-only |
| Bots | `/setup`, `/api/bots`, `/api/bots/[botId]`, `/api/bots/[botId]/control`, `/api/bots/[botId]/capital`, `/api/bots/[botId]/history` | UI control body is `TURN_ON` or `TURN_OFF` only; Admin capital adjustments are serialized and history is authorized per wallet |
| Users | `/admin/users`, `/api/admin/users/*` | Admin only |
| Settings | `/settings`, `/api/wallets/*`, `/api/settings/synchronization`, `/api/settings/notifications` | wallet/broker, schedule, and persisted alert preferences |
| Diagnostics | `/api/health`, `/api/ready`, `/api/metrics` | liveness, readiness, Prometheus |
| History | `/activity`, `/bots/[botId]` | order lifecycle filtering and per-bot order history; unlinked Alpaca snapshots remain explicitly external |

API schemas use Zod. Add endpoint-specific tests for authorization and invalid input when extending them.

Client feedback translates current domain error codes into contextual notices; raw internal codes stay internal. Retired codes must not reappear as user-facing product rules.

Bot creation performs the same pure capital validation in the client for early feedback, but the API transaction remains authoritative and repeats the validation before reserving wallet capital.

## Environment reference

`.env.example` is the canonical variable list. Never place actual values in README or docs.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Dedicated MySQL database URL |
| `TRADING_MODE` | yes | Must remain `paper` |
| `APP_ENCRYPTION_KEY` | yes | Base64 32-byte AES-256-GCM master key |
| `SESSION_SECRET` | yes | Session signing/entropy secret |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | first boot | Initial Admin only |
| `ALPACA_PAPER_BASE_URL`, `ALPACA_API_KEY`, `ALPACA_API_SECRET` | for broker sync | Alpaca Paper credentials only |
| `ALPACA_DATA_FEED` | optional | Current default is `iex` |
| `AI_ENABLED` | optional | Reserved; no AI adapter is wired yet |
| `SMTP_*` | optional | SMTP connection readiness for future alert delivery; no sender is wired yet |

## Testing and change protocol

The authoritative policy is [`../AGENTS.md`](../AGENTS.md): write a failing test first, make the narrow implementation pass, then run all quality gates.

Suggested test ownership:

- Pure bot/risk/capital state: `src/modules/**/**.test.ts`
- HTTP authorization/input: route-level or integration tests
- Prisma transactions/migrations/leases: isolated MySQL integration tests
- Broker/AI: sanitized contract fixtures, never external calls in automated tests

Required completion command sequence:

```bash
npm run test
npm run typecheck
npm run build
```

For schema changes:

```bash
npm run prisma:generate
npx prisma validate
```
