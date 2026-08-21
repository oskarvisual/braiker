# BrAIker project context and handoff

## Purpose

BrAIker is a safe paper-trading control room for learning and validating a future automated trading system. The name is rendered as **BrAIker** in product copy when practical; `braiker` remains the technical identifier for folders, packages, database names, and environment variables.

The product is intentionally narrow for now: USD, regular-market US equities/ETFs, and Alpaca Paper only. The user wants a focused, auditable system before considering crypto, Binance, additional brokers, or live trading.

## Source of truth

This document overrides product assumptions inferred from stale code, screenshots, or earlier conversation. `README.md` is the entry point; `AGENTS.md` defines mandatory engineering behavior.

If a request conflicts with these rules, stop and explain the conflict instead of silently weakening them.

## Non-negotiable safety model

1. `TRADING_MODE` must be `paper`; live endpoints and live credentials are rejected.
2. Alpaca Paper is the only broker. Do not add crypto, Binance, live mode, margin, shorting, leverage, options, or extended-hours trading.
3. Money is persisted and compared with decimal strings / Prisma `Decimal`, never JavaScript floating point.
4. Every business query is scoped by wallet access. MySQL has no row-level security; repository/API authorization is the enforcement boundary.
5. In Personal Paper mode, the one Alpaca Paper credential pair is server-only in `.env`. It never reaches the browser, logs, AI providers, tests, or committed files. Legacy encrypted `BrokerConnection` records are retained only for future multi-account migration and are not used by the current worker.
6. Risk and Kill Switch checks are enforced at the execution boundary. The execution transaction locks the bot row through idempotent Alpaca `client_order_id` recovery/submission; bot controls lock that same row. Therefore a persisted OFF/Kill Switch blocks new submissions, while a submission already linearized first completes idempotently before OFF is saved.
7. Realized daily and rolling-week losses come only from durable, bot-attributed fill P&L. Pending proposals atomically reserve the bot's available virtual capital in MySQL; competing proposals cannot overbook it. Terminal reconciliation claims each order once and locks the bot before changing cash or reservations.
8. A temporary-password user may only change their password or sign out. Login is persistently throttled by hashed identity/IP keys, and `/api/metrics` requires an Admin session or a configured bearer token.

## Bot model

### Personality profiles

There are exactly three initial personalities. Settings persists the three editable default caps (position, daily loss, and trades/day) in `BotProfileDefault`; they are upper bounds for new bots and for later edits to a bot. A bot may be configured lower but never higher than its current personality default.

| Profile | Intent | Max position | Max trades/day |
| --- | --- | ---: | ---: |
| Guardian | Conservative, stronger confirmation | $5 | 2 |
| Navigator | Balanced, moderate exposure | $10 | 4 |
| Explorer | Dynamic, more candidates inside strict limits | $15 | 6 |

The initial values shown in the table are defaults, not hard-coded product behavior. An Admin may edit them in Settings within the personality's permanent envelope: the static portfolio-exposure and weekly-loss boundaries remain fixed, the daily limit cannot exceed the weekly limit, and trades/day cannot exceed twice the base-profile default. Existing bots are not changed automatically; their saved policy remains in force until they are explicitly edited. The user may create multiple bots from the same personality, assign each a name, and add per-bot instructions. These instructions are stored as configuration/memory but must never change the risk boundary.

### Capital, survival, and death

- `PaperCapitalPool(scope="global")` is the app-level capital envelope for the single Alpaca Paper account. It has managed and unallocated capital and must never exceed Alpaca's reported cash when changed.
- A wallet is a virtual portfolio; it has `managedCapital` and `unallocatedCapital`, but it is not a broker account and never owns credentials in Personal Paper mode.
- Creating a wallet atomically transfers its requested virtual capital from `PaperCapitalPool.unallocatedCapital` into the wallet. An Admin can later add capital from that pool or release only the wallet's unallocated capital back to it; no adjustment may take capital already assigned to bots. These moves are serialized and audited.
- Creating a bot atomically transfers its requested budget from unallocated wallet capital to that bot's `initialCapital` and `currentCapital`.
- Capital events are recorded. An Admin may add unallocated wallet capital to an active bot or return part of its current capital to the same wallet. A live bot must retain positive capital; to return all of it, turn the bot OFF and delete it. A bot cannot use another bot's money.
- Survival is always enabled. It is not a profile setting and must not appear as an optional switch.
- The product invariant is that `currentCapital = 0` makes a bot `DEAD`, irreversibly. A dead bot cannot be reactivated, edited, deleted, or repurposed; its history remains.
- Clone creates a *new* bot with a new budget and an explicit source reference. It may clone an active or dead source, but must never revive or modify the source bot.

### Public controls

The only public operating control is a single ON/OFF switch:

- **ON** maps internally to `PAPER_ACTIVE` and clears the kill switch after all validations.
- **OFF** maps internally to `OFF` and engages the kill switch before pausing the bot.
- Multiple bots in the same wallet may be `PAPER_ACTIVE` concurrently. Each remains constrained by its own isolated capital, Kill Switch, lifecycle state, and risk policy. Future execution work must preserve order, position, fill, and P&L attribution per bot.
- `RISK_HALTED`, `ERROR`, and `MAINTENANCE` bots must not be activated through ordinary control changes.
- When ON is blocked, the interface must show a human-readable toast and, when known, name the bot that must be turned off. Internal error codes must never be shown to the user.

Do not bring back Simulation, a Paper button/tag, a separate enable button, or a user-configurable survival mode. The MySQL/Prisma enum still includes `SIMULATION` for historical migration compatibility; it is not a user-facing feature and must not appear in new UI, API contracts, or copy.

## Current user experience

- `/login` — sign in.
- `/` — dashboard: Alpaca account figures, chart, positions, broker orders, and bot summary.
- `/setup` — Admin bot listing and add/edit/clone modal. It shows current bot capital, risk limits, allowed symbols, and one ON/OFF switch. Active bots can move capital to/from their wallet; dead bots expose history and cloning only. Clicking a bot name or eye icon opens its full-width order-history modal.
- `/activity` — order-first History. It filters by lifecycle (`Open`, `In progress`, `Closed`, `Rejected`), bot, and symbol/status text. BrAIker orders link to `/bots/[botId]` and their English decision report at `/decisions/[proposalId]`; Alpaca orders without an internal link are explicitly shown as external/no bot linked.
- `/bots/[botId]` — read-only bot detail: configured universe, capital/status, and that bot's recorded BrAIker orders. Each internal order links to its decision report. A dead bot remains history-only.
- `/decisions/[proposalId]` — authorized, read-only English causal report: market snapshot and indicators → deterministic signal → optional AI advisory → persisted risk checks → execution lifecycle → fills. It never exposes credentials or prompt secrets.
- `/settings` — Admin global Paper-capital, virtual wallet creation and per-wallet budget management, sync interval, alert-preference, and profile configuration. Profile defaults affect new bots; bot-specific risk limits are edited from the existing bot's three-step editor. It never asks for Alpaca credentials because Personal Paper mode reads the single pair from `.env`. Webhooks and email each choose their destination and alert events independently. Webhook destinations are encrypted and never shown again. It is reached through the top account menu, not the sidebar.
- `/status` — Admin-only operational status page, reached through the top account menu. It performs live checks for MySQL, the worker heartbeat and Alpaca Paper, reports ON/OFF/DEAD bot counts, and accurately labels OpenAI, SMTP and webhooks as disabled, configured-but-not-delivered, or unavailable. It never displays credentials, webhook URLs, recipients, or account identifiers.
- `GET /api/status` — public, unauthenticated JSON equivalent for uptime checks and automations. It returns an overall `healthy`/`warning`/`unavailable` state, check time, aggregate bot counts, and the same sanitized service states as `/status`; it must never add credentials, webhook destinations, recipients, account IDs, database URLs, or raw exception details.
- `/admin/users` — Admin user CRUD, reached through the top account menu.
- `/account/password` — password change.

The sidebar is fixed on desktop and contains only operational navigation: Dashboard, History, and Bots for Admins. The compact top account menu contains the signed-in identity, Settings and Users for Admins, password management, and sign-out. New pages should use `AppNavigation` and the `shell appContent` layout rather than a back-to-dashboard link.

Bot creation must show the selected wallet's unallocated capital before submission. The UI blocks an over-budget or zero-budget allocation and explains how to free or provide capital; it must never leave the user with a raw `INSUFFICIENT_UNALLOCATED_CAPITAL` code. More than one independently funded bot can be powered on in the same wallet.

The bot modal is a three-step wizard. Navigation is non-persistent: it must never save or close because the user presses Enter in a field. Only the explicit final Create/Save button may persist the bot and close the modal.

## Implemented market and execution foundation

- The worker owns one persistent Alpaca IEX WebSocket for the fixed ten-symbol universe. It persists immutable market events plus completed one-minute bars, writes a durable authenticated stream heartbeat, and reconnects with bounded exponential backoff. The browser never connects to Alpaca.
- The worker runs a leased `market-cycle` once per minute. It checks the one Alpaca Paper market clock, reconciles the global account once, loads all active bots, and uses REST backfill plus latest quotes for the union of permitted symbols and `SPY`/`QQQ`. REST is the gap-recovery path; the shared evaluation remains idempotent.
- Only completed candles are persisted/evaluated. `MarketEvaluation.evaluationKey` makes an evaluation idempotent per bot, symbol, timeframe, and candle timestamp.
- `trend-v1` is deterministic: EMA trend, RSI, ATR, momentum, relative volume, and SPY/QQQ regime create `BUY`, `SELL`, or `HOLD`. Each pass persists a market snapshot and strategy signal.
- An eligible `BUY`/`SELL` candidate may receive an optional OpenAI advisory review. The adapter receives a redacted market/signal context, uses structured output, is rate-limited per bot, and records model, request, response, token use, cost estimate, or sanitized failure. It may only veto (`REJECT`) a candidate. `PROCEED`, `CAUTION`, timeout, malformed output, or provider failure never approve risk or submit an order; the deterministic path continues to the existing risk engine.
- A candidate not vetoed by AI goes through the existing risk engine, then an idempotent execution job. `client_order_id` is recovered from Alpaca before a retry submits an order.
- Reconciliation records broker snapshots and terminal fills. Virtual cash, reservations, and `BotPosition` are attributed to exactly one bot; a zero-cash bot with no remaining position becomes permanently `DEAD`, is switched OFF, and retains its trace.

The design intent is survival, not maximum activity: no strategy, prompt, or profile can bypass risk, capital isolation, the kill switch, or permanent death semantics.

## What is deliberately not finished

Do not claim these exist or wire placeholders that imply they do:

1. A reproducible backtest runner. Persistent Alpaca WebSocket streaming is implemented as one worker-owned connection with durable heartbeats, bounded reconnects, and REST backfill; the shared minute cycle remains the idempotent decision path.
2. RAG, bot conversation, memory retrieval, or a bot learning loop. The implemented OpenAI advisory is optional, rate-limited, auditable, and cannot gain execution authority.
3. Alert delivery. Notification preferences and destinations are persisted now, but no worker dispatches webhook/email messages until durable event semantics and delivery/retry handling are implemented. SMTP configuration remains environment-only.

## Next product milestones

Prioritize in this order unless the user explicitly reprioritizes:

1. Add reproducible backtests without weakening the existing stream, REST-backfill, and evaluation safeguards.
2. Add notification delivery only after durable event semantics exist.
3. Add richer per-bot decision reports and portfolio/P&L views.
4. Extend the optional AI advisory only behind validated, auditable, non-privileged adapters.

## Paper soak entry criteria

Before an unattended local soak, run `npm run test`, `BRAIKER_TEST_DATABASE_URL=<isolated-disposable-url> npm run test:integration`, `npm run typecheck`, `npm run build`, `npm run prisma:generate`, `npx prisma validate`, and `npm run paper:soak:check`. Make a manual dashboard sync and verify the worker heartbeat/`/api/ready`. Keep one worker process only. Use a small global Paper-capital envelope, confirm virtual wallet/bot allocation totals, and review broker/order attribution after every fill. Follow [`PAPER_SOAK_RUNBOOK.md`](PAPER_SOAK_RUNBOOK.md) for daily checks and stop conditions. Do not promote this deployment to live trading: live requires a separate deployment, database, secrets, and security review.

## UI principles

- Prefer a calm, high-contrast dark control-room design with green as the normal positive/action color and red reserved for destructive actions.
- Creation and editing happen in polished modals; listing pages should remain simple tables/cards.
- Inputs, spacing, modal states, and fixed-sidebar padding must be consistent across all views.
- Keep configuration and account actions out of the operational sidebar; group them in the top account menu.
- Action outcomes use global, dismissible, auto-expiring toasts so failed modal actions are visible without being rendered outside their context. Keep browser validation and authentication field errors next to their inputs.
- The bot table avoids duplicate ON/OFF status: the Power switch is the operating-state control, while Capital shows the amount still assigned to the bot. Dead bots do not render a switch.
- Never show raw UUIDs or technical audit event names as the primary user-facing history.
- Always explain safety-relevant state in plain language; avoid exposing internal enum names.

## Decision checklist for an AI

Before coding, answer these questions from the repository rather than guessing:

1. Does this introduce a real broker side effect, execution capability, or secret exposure?
2. Is the requested data scoped to a wallet and authorized for the current role?
3. Does it preserve isolated bot capital and permanent death semantics?
4. Is it user-facing now, or merely a future architecture concept?
5. What failing automated test proves the intended behavior, including rejection paths?

Then follow the test-first and verification gates in `AGENTS.md`.
