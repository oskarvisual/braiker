# BrAIker architecture and implementation guide

## Runtime topology

```text
Browser
  └─ Next.js web app + authenticated API
       └─ MySQL 8 (Prisma)

Node worker
  ├─ node-cron tickers
  ├─ MySQL-backed task leases
  ├─ one global Alpaca Paper reconciliation
  ├─ shared minute market-data / strategy cycle
  └─ execution-job processing
       └─ Alpaca Paper REST API
```

Docker Compose is intentionally limited to `web` and `worker`. MySQL is external and configured by `DATABASE_URL`; do not add a database container unless the user explicitly changes that deployment decision.

## Web and worker responsibilities

| Component | Owns | Must not do |
| --- | --- | --- |
| Web | UI, session auth, RBAC, configuration APIs, read models, manual sync trigger | expose credentials, open broker WebSockets, create an execution side effect from the browser |
| Worker | bootstrap Admin, scheduler leases, reconciliation, shared market cycle, execution jobs, worker heartbeat, Telegram alert/report delivery, Bot Manager reports, and Bot Manager polling | run with live configuration, bypass risk checks, trust browser input as authorization |
| MySQL | durable domain state, audit state, schedules, leases, snapshots, virtual wallet allocations | contain plaintext broker secrets |

## Scheduler

`node-cron` is only a wake-up mechanism. Database tables hold the durable schedule/job truth.

- `scheduled_tasks`: named task, cron, timezone, enabled state, recovery policy.
- `job_runs`: run identity, attempts, leases, timestamps, errors.
- Lease recovery runs every minute. Its idempotent conditional updates retry bounded transient MySQL `P2034` write conflicts; a non-retryable error still fails the leased task visibly.
- Portfolio reconciliation is provisioned every five minutes by default and can be changed in Settings.
- The leased `market-cycle` runs once per minute and processes all eligible bots in one global Paper-account pass; it must never become a cron job per bot or per virtual wallet.
- The worker processes one execution job every 30 seconds. An ON bot can create a proposal only through the deterministic market cycle and risk engine.

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
| Wallet/broker | `PaperCapitalPool`, `Wallet`, `BrokerConnection` (legacy/future multi-account only) |
| Bots | `BotProfileDefault` (three editable personality caps), `BotInstance` (including optional `cloneSourceId` lineage), `BotCapitalEvent`, `BotMemoryEntry`, `BotModeTransition`, `BotStateTransition`, `Watchlist` |
| Market/decision | `MarketBar`, `MarketSnapshot`, `MarketStreamEvent`, `StrategySignal`, `AiDecision`, `TradeProposal`, `RiskDecision` |
| Execution/portfolio | `MarketEvaluation`, `ExecutionJob`, `Order`, `Fill`, `BotPosition`, `Position`, `BrokerOrderSnapshot`, `PortfolioSnapshot`, `DailyPerformance`, `ReconciliationRun` |
| Operations | `ScheduledTask`, `JobRun`, `SystemEvent`, `ErrorEvent`, `NotificationSettings`, `NotificationAlert`, `AiRuntimeState`, `WorkerRuntimeState`, `MacroCalendarEvent`, `TelegramManagerSession`, `TelegramPairingCode`, `TelegramRuntimeState`, `TelegramManagerMessage`, `ManagerChatSession`, `ManagerChatMessage`, `ManagerActionProposal`, `BotChatSession`, `BotChatMessage`, `BotDailyContext` |
| Resources | `ResourceSource`, `ResourceSnapshot`, `DailyMarketBrief`, `DailyBriefResource`, `DailyBotInput` |

Before changing the schema, inspect `prisma/schema.prisma` and use an additive, versioned migration. Do not point destructive tests to the local development database.

## Authentication and authorization

- Sessions are opaque, hashed tokens stored in MySQL and carried via secure cookies.
- `LoginThrottle` keeps only SHA-256 identity/IP keys, failure counts, window start, and block expiry. It is updated in a serializable transaction. Temporary-password users are restricted to password change/sign-out until `mustChangePassword` is cleared.
- Global roles: `ADMIN`, `OPERATOR`, `VIEWER`.
- Wallet membership adds wallet-specific roles. All wallet resources must check membership (Admins are the only cross-wallet administrative exception where implemented).
- `VIEWER` can read only; configuration and bot setup are Admin-only today.
- Every modifying API endpoint verifies same origin and authenticated authorization.

Do not infer permission from a wallet/bot UUID supplied by a request.

## Broker credential handling

Personal Paper mode reads the one Alpaca API key/secret directly from server-only environment variables. It does not persist, duplicate, or request per-wallet credentials. `BrokerConnection` fields remain encrypted independently (ciphertext, IV, tag, key version) using AES-256-GCM for a future multi-account migration only. The master encryption key is `APP_ENCRYPTION_KEY` and stays in environment/secrets storage.

Browser responses expose configuration status, never API key or secret values. Webhook destinations use the AES-256-GCM storage pattern through `NotificationSettings`; the browser gets only whether a destination is configured, never its URL.

## Bot state rules

Public UI uses only ON/OFF. Internal mappings:

```text
TURN_ON  → runMode PAPER_ACTIVE, killSwitch false, status RUNNING
TURN_OFF → runMode OFF,          killSwitch true,  status PAUSED
```

Activation fails for a dead bot, a halted/error/maintenance bot, or a bot with a retained kill switch. Several independently funded bots may be active in the same wallet. Death is immutable. These must remain negative tests.

The broker reconciliation is the authoritative fill-accounting boundary. Terminal Alpaca outcomes lock the internal order, conditionally claim its reservation once, lock only the proposal bot, create idempotent attributed fills (including `realizedPnl`), update only that bot's virtual cash/reservation and `BotPosition`, and mark it `DEAD` when its virtual cash is exhausted with no position remaining. Death turns it OFF and is never reversible. This keeps concurrent reconciliations from overwriting a capital/reservation update.

Proposal creation computes a `TradeProposal.reservationAmount` with `Prisma.Decimal`; an atomic conditional `UPDATE` reserves it only when `(currentCapital - reservedCapital)` is sufficient and the bot is eligible. The risk engine reads daily and rolling-week P&L from `Fill.realizedPnl`, never from a float calculation or an in-memory counter.

Execution claims a job then enters a serializable transaction, locks the proposal bot, evaluates the persistent Kill Switch/risk state, and holds that lock through the idempotent `client_order_id` lookup/submission. `TURN_OFF` uses the same lock. The resulting ordering prevents a stale pre-flight Kill Switch check from submitting an order after OFF is persisted.

The Prisma `BotRunMode.SIMULATION` value is a historical compatibility value. It is not an allowed new control action and should only be handled safely as inactive legacy data.

## Personality-default configuration

The static Guardian/Navigator/Explorer templates retain their strategy weights and permanent paper-only safety envelope. `BotProfileDefault` stores only the Admin-configurable position, daily-loss, and trades/day values. It is merged with the static template at read time.

- Settings changes affect new bots immediately; they do not silently rewrite `BotInstance.riskPolicy` for existing bots.
- When an existing bot is saved, its three risk inputs may be adjusted up to the current configured cap for its personality.
- The configured position cannot exceed the static `maxPortfolioExposure`; daily loss cannot exceed static `maxWeeklyLoss`; trades/day cannot exceed twice the static template count. Margin, shorting, options, leverage, portfolio exposure, weekly loss, and order buffer stay non-configurable.
- `PUT /api/settings/bot-profiles` is Admin-only, same-origin, audited, validates decimal values, and upserts the selected template override. `getConfiguredBotTemplate` is the required source for bot create/update limits; do not use a static template for those paths.

## APIs and pages

| Area | Endpoints / page | Notes |
| --- | --- | --- |
| Auth | `/login`, `/api/auth/*`, `/account/password` | session and password lifecycle |
| Dashboard | `/`, `/api/dashboard/overview`, `/api/dashboard/sync` | sync is Admin-only |
| Bots | `/setup`, `/api/bots`, `/api/bots/[botId]`, `/api/bots/[botId]/control`, `/api/bots/[botId]/capital`, `/api/bots/[botId]/history`, `/api/bots/[botId]/analysis` | UI control body is `TURN_ON` or `TURN_OFF` only; Admin capital adjustments are serialized and Operations/Analysis history is authorized per wallet. The history read model includes active-position count and reserved capital solely for the deterministic, read-only survival indicator; it is never an execution input. |
| Users | `/admin/users`, `/api/admin/users/*` | Admin only |
| Settings | `/settings`, `/api/wallets`, `/api/wallets/[walletId]/capital`, `/api/settings/paper-capital`, `/api/settings/synchronization`, `/api/settings/notifications`, `/api/settings/telegram/pairing` | global Paper capital, serialized virtual-wallet budget changes, schedule, persisted alert preferences, and short-lived Telegram Bot Manager pairing |
| Bot Manager | `/manager`, `/api/manager/sessions`, `/api/manager/actions` | Admin-only operational chat. An exact-name ON/OFF request from either web or paired Telegram creates the same durable proposal, never an immediate action. Web uses its confirmation button; Telegram uses a single-use `CONFIRMAR <código>`. Both enter the existing locked control service only after confirmation. |
| Resources | `/resources`, `/api/resources` | Admin-only URL registry, safe bounded extraction, snapshots/hashes, source pause/activation, immutable daily briefing history, and the visible per-bot daily recommendations derived from it. The page uses modal New/Edit forms; PATCHing a URL revalidates its trust and clears refresh state. |
| Bot chat | `/bots/[botId]`, third history-modal **Chats** tab, `/api/bots/[botId]/chat` | Web-only user/bot-isolated sessions; they are locked unless the bot is alive, `PAPER_ACTIVE`, `RUNNING`, and not Kill-Switched. No configuration, capital, risk, Kill Switch, or order authority. Explicit `Important:` / `Importante:` user context and Manager-created notes persist separately for the current NY market day only. |
| Diagnostics | `/api/health`, `/api/ready`, `/api/metrics`, `/status`, `/api/status` | liveness, readiness, Prometheus, authenticated operational view, and public sanitized uptime JSON; metrics needs an Admin session or `Authorization: Bearer $METRICS_TOKEN` |
| History | `/activity`, `/bots/[botId]` | order lifecycle filtering and per-bot order history; unlinked Alpaca snapshots remain explicitly external |

`/status` is an Admin-only server-rendered operational view. It checks MySQL with `SELECT 1`, reads the durable `WorkerRuntimeState` written by the worker (never a container-local file), checks the durable authenticated Alpaca market-stream heartbeat, and calls the existing Alpaca Paper adapter health check. It also shows bot lifecycle counts. ON means eligible for the worker market cycle, not proof that the bot is currently evaluating; a stale or unavailable worker makes this explicit. The worker owns exactly one WebSocket connection for the union of active enabled watchlists plus `SPY`/`QQQ`; it persists immutable bars/quotes, updates subscriptions, and reconnects with bounded backoff, while the REST cycle provides reconciliation/backfill and the idempotent evaluation boundary. OpenAI is `Configured` only when the optional advisory feature flag and server-only key are present; a durable provider quota/billing rejection changes that service to a sanitized warning and sets `AiRuntimeState` to `QUOTA_EXHAUSTED`. Only that persistent reason exposes the Admin reactivation control. It sends one minimal non-trading Responses call and reopens the circuit only after success; other failures remain closed. SMTP, webhook, and Telegram entries accurately describe configuration readiness. Secrets and destinations remain server-only.

After each worker heartbeat and once per minute, the operational monitor samples the status. Only required dependency warnings/unavailability (`database`, `worker`, `market-stream`, `alpaca`) create a `SYSTEM_STATUS_FAILURE` alert; intentionally disabled optional email/webhooks/Telegram never create one. Each `NotificationAlert` has one unique cause key, opens or refreshes atomically, resolves when the cause recovers, and resets its delivery state for a later recurrence. Bot Manager daily, weekly, and monthly paper-only reports are scheduled through MySQL leases at 4:35 PM ET, Friday 4:45 PM ET, and 5:00 PM ET on the first day of each month; each upserts one idempotent `NotificationAlert` for its reporting period. Webhook, email, and Telegram delivery are opt-in per selected event, at most once per channel after success, and failed attempts are retried after ten minutes. The report upsert preserves completed delivery timestamps, so a scheduler retry does not redeliver a completed channel. The notification-settings API validates each channel independently only when it is enabled; incomplete details in an inactive channel cannot block saving a separate active channel. Webhook destinations are decrypted only in the worker; SMTP and the Telegram bot token stay entirely in environment variables. Telegram alerts and report notifications are delivered only to the paired Bot Manager session and plans/status/API responses expose no chat identifier. Delivery payloads contain only sanitized alert fields. OpenAI cannot expose a reliable remaining-account balance through the application key, but a provider `insufficient_quota`/billing rejection opens a distinct `OPENAI_QUOTA_EXHAUSTED` alert and durable `AiRuntimeState` circuit. The circuit prevents future advisory calls until the Admin-only recheck successfully completes; a failed or still-quota-limited recheck remains closed. A failed worker or unavailable database cannot reliably send its own alert, so an independent monitor must poll public `/api/status` and alert on a non-healthy response. These alerts and the AI circuit are observational/control-plane only: they never change bot power, capital, risk, Kill Switch, or execution authority.

Telegram is worker-owned and uses `getUpdates` polling with a durable `TelegramRuntimeState.nextUpdateId`; a restart does not replay a processed update. Settings creates an 18-byte code that expires after ten minutes and persists only its SHA-256 hash in `TelegramPairingCode`. A matching `/start <code>` is atomically consumed and pairs one global `TelegramManagerSession`; the raw code is redacted from `TelegramManagerMessage`. The paired user has a deterministic, pinned `ManagerChatSession` named Operations. Telegram alerts and selected Bot Manager report notifications are written there with a unique alert reference; inbound Telegram messages use their update id as a unique reference, so a duplicate update cannot produce a second model call or reply. A browser message and reply from that same pinned Operations session are persisted as outbound Telegram audit records and mirrored to the paired chat; ordinary browser sessions are never mirrored. The web Manager rehydrates that MySQL-backed Operations transcript on focus and every five seconds, so inbound Telegram messages and replies appear without navigating away. Telegram delivery remains optional: an outbound mirror failure cannot roll back or fail the already-persisted browser conversation. `/manager` also creates ordinary per-user `ManagerChatSession` conversations. `ManagerChatMessage` holds sanitized text only, bounded history, and no provider keys or raw operational payloads. The Bot Manager model cannot execute an action or invoke configuration, capital, Kill Switch, risk, broker, or execution APIs. Before model dispatch, a shared resolver recognizes only an explicit exact-name ON/OFF request from web or paired Telegram; it creates `ManagerActionProposal` with a hashed, expiring confirmation code. It also recognizes `Note for <exact bot>: …` / `Nota para <bot exacto>: …`; only if that bot is actively runnable does it create a `MANAGER_NOTE` `BotChatSession`, system message, and one `BotDailyContext` record. The note remains in the dashboard's local bot chat and is never mirrored to Telegram. The browser receives no raw code and confirms through its authenticated button; Telegram receives the code once and stores only a redacted outbound audit record. Confirmation atomically claims the proposal, then calls the existing locked bot-control transaction against the same database so permissions, lifecycle, risk state, and Kill Switch are rechecked at execution. Pending web proposals are retrieved from MySQL with the conversation list, so refresh cannot hide them. `telegramReceiveMessages` is a separate persisted Settings flag; no ordinary inbound chat is accepted unless both pairing and that flag are enabled. Runtime environment is process-start configuration, so changing an environment value requires restarting both `web` and `worker` before status, polling, or delivery can use it.

`GET /api/status` is deliberately public so external uptime monitors can consume the same operational view without a session. It returns only a derived overall state, ISO check time, aggregate bot counts, and the already-sanitized service labels/states/details from `getSystemStatus`. It must not expose raw failures, hostnames, credentials, recipients, webhook destinations, account IDs, or configuration values. It uses `Cache-Control: no-store`; monitoring clients should poll at a modest interval (for example, once a minute), not treat it as a streaming endpoint.

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
| `ALPACA_PAPER_BASE_URL`, `ALPACA_API_KEY`, `ALPACA_API_SECRET` | for global broker sync | One server-only Alpaca Paper credential pair; never requested per virtual wallet |
| `ALPACA_DATA_FEED` | optional | Current default is `iex` |
| `AI_ENABLED` | optional | Enables the optional OpenAI advisory for deterministic `BUY`/`SELL` candidates only; it cannot approve or execute orders |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `BOT_MANAGER_CHAT_MODEL`, `OPENAI_TIMEOUT_MS`, `AI_MAX_ANALYSES_PER_BOT_PER_DAY` | when AI enabled | Server-only OpenAI advisory configuration; `BOT_MANAGER_CHAT_MODEL` optionally overrides the non-executing Manager model, requests use structured output or `store: false`, and no browser receives credentials |
| `SMTP_*` | optional | SMTP delivery for the alert types explicitly selected in Settings; no SMTP secret is stored in MySQL |
| `TELEGRAM_BOT_TOKEN` | optional | Server-only Telegram Bot API token for selected alert delivery and the worker-polled Bot Manager session; it is never stored in MySQL or returned by APIs |
| `METRICS_TOKEN` | optional | At least 32 characters when set; bearer protection for Prometheus scraping when no Admin session is used |

## Staging deployment topology

`app.staging.yaml` is the reproducible DigitalOcean App Platform definition and tracks the repository's `staging` branch for all three components. It creates one App Platform application containing one public web service (port 3000), one private worker (port 8080 liveness endpoint), and a `PRE_DEPLOY` Prisma migration job. The components share only the Managed MySQL connection and runtime secrets; they are not separate apps and neither runtime component carries deployment credentials. The image is built once from the Dockerfile and can run `node server.js`, `node dist/main.js`, or `npm run prisma:migrate`. Exactly one worker replica is mandatory for the Paper soak.

## Testing and change protocol

The authoritative policy is [`../AGENTS.md`](../AGENTS.md): write a failing test first, make the narrow implementation pass, then run all quality gates.

Suggested test ownership:

- Pure bot/risk/capital state: `src/modules/**/**.test.ts`
- HTTP authorization/input: route-level or integration tests
- Prisma transactions/migrations/leases: isolated MySQL integration tests
- Broker/AI: sanitized contract fixtures, never external calls in automated tests

`src/modules/security/security.mysql.integration.test.ts` is skipped unless `BRAIKER_TEST_DATABASE_URL` points at an isolated disposable MySQL database. It exercises competing reservations, competing reconciliation, realized P&L windows, and Kill Switch rejection with a mock broker; it must never use the development database or external credentials.

### Current market cycle

`AlpacaMarketDataAdapter` reads Alpaca Market Data REST with the configured Paper credentials and feed. Each cycle backfills/persists completed one-minute bars, obtains the latest quote, then evaluates the active bot's allowed symbol with shared `SPY` and `QQQ` regime context. `MarketEvaluation` prevents duplicate work for a candle. `trend-v1` is deterministic and persists the inputs and signal before any AI review or risk evaluation.

After each open-market pass, the worker writes one `BotScanRun` per active bot. It contains only an operator-safe summary and per-symbol outcome (`HOLD`, `APPROVED`, risk/AI rejection, insufficient bot capital, duplicate candle, or missing market data); raw exception strings, credentials, and provider payloads are never stored there. A market-closed or empty-watchlist state is recorded at most once per bot per hour. The worker runs a leased daily retention task that deletes `BotScanRun` rows older than 30 days. `GET /api/bots/[botId]/analysis` is authenticated and enforces the same wallet-membership rule as order history.

When `AI_ENABLED=true`, an eligible deterministic `BUY`/`SELL` candidate can call `OpenAiAdvisor` through the Responses API with a structured, redacted market/signal payload and a strict timeout. The payload may include that bot's immutable `DailyBotInput` for the New York market date: fixed cautious recommendations and only source category/host/hash citations, never fetched source prose. It can append that same day's bounded `BotDailyContext` messages only after labeling them untrusted, caution-only context; no context exists without an immutable briefing and it cannot create a signal, increase size, relax a limit, override risk, or submit an order. The review is capped per bot per UTC day, and records `AiDecision` metadata including sanitized request/response, token counts, Decimal cost estimate, or sanitized provider failure. A confirmed quota/billing error sets `AiRuntimeState=QUOTA_EXHAUSTED` before the worker evaluates another advisory; it is not automatically retried. The status-page reactivation action sends only a short non-trading request (`Return READY`) and enables review only after a successful response. `REJECT` stops that candidate before risk; `PROCEED` and `CAUTION` have no approval authority, and a timeout/malformed/failed review falls back to the deterministic risk path. Neither the browser nor tests call the provider, and no provider result can alter capital, limits, the Kill Switch, or idempotent order submission.

`MacroCalendarEvent` contains only the Admin-reviewed official source URL, event title, impact, and timestamp. During the market cycle the worker queries nearby high-impact events and passes the deterministic guard result into the risk context. `MACRO_EVENT_GUARD` rejects a `BUY` from ten minutes before through fifteen minutes after an event, but a `SELL` remains eligible to reduce exposure. The guard is persisted in the proposal's ordinary `RiskDecision` checks; no model or fetched resource prose may bypass it.

`/decisions/[proposalId]` reads the persisted causal record for an authorized wallet member and renders an English report of snapshot, indicators, deterministic signal, optional AI advisory, risk checks, execution state, and fills. Reports are read-only and do not expose secrets.

The worker also owns one persistent Alpaca market-data WebSocket for the union of ON-bot watchlists plus `SPY`/`QQQ`, never the browser and never one socket per bot. It authenticates after connection, updates one-minute-bar and quote subscriptions as watchlists change, persists immutable provider events and completed bars, and reconnects with bounded exponential backoff. It writes a durable authenticated heartbeat that `/status` and `/api/status` read. REST backfill remains active for gaps and the `MarketEvaluation` key remains the decision idempotency boundary, so streaming never bypasses risk or execution. Global reconciliation is executed once per cycle; broker orders with a BrAIker `client_order_id` are attributed to the originating virtual wallet through the internal order → proposal → bot trace. Broker-only orders remain associated with the default global wallet.

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
