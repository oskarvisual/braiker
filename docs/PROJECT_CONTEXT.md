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
- The UI exposes a deterministic, read-only survival indicator (`Calibrating`, `Thriving`, `Stable`, `Cautious`, `Stressed`, `Critical`, or `Dead`) with a native emoji and color. It is never a control and cannot change risk, power, Kill Switch, capital, or execution. `Dead` always wins; before the first scan the bot is `Calibrating`; and capital that is invested in an open position or reserved for an order is treated as deployed, so low liquid cash alone must never produce a stressed/critical label. The bot table intentionally hides the decorative initial avatar so the emoji is the primary visual cue.

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
- `/setup` — Admin bot listing and add/edit/clone modal. It shows current bot capital, a read-only survival indicator, risk limits, allowed symbols, and one ON/OFF switch. Active bots can move capital to/from their wallet; dead bots expose history and cloning only. Clicking a bot name or eye icon opens its full-width history modal with the same survival explanation plus separate Operations and Analysis activity tabs.
- `/activity` — order-first History. It filters by lifecycle (`Open`, `In progress`, `Closed`, `Rejected`), bot, and symbol/status text. BrAIker orders link to `/bots/[botId]` and their English decision report at `/decisions/[proposalId]`; Alpaca orders without an internal link are explicitly shown as external/no bot linked.
- `/bots/[botId]` — private contextual explanation chat, isolated by `(botId,userId)`. It sees bounded safe data for that bot’s watchlist, scans, and proposals, and cannot alter bot configuration, capital, risk, power, Kill Switches, or orders.
- `/decisions/[proposalId]` — authorized, read-only English causal report: market snapshot and indicators → deterministic signal → optional AI advisory → persisted risk checks → execution lifecycle → fills. It never exposes credentials or prompt secrets.
- `/settings` — Admin global Paper-capital, virtual wallet creation and per-wallet budget management, sync interval, notification-preference, and profile configuration. Profile defaults affect new bots; bot-specific risk limits are edited from the existing bot's three-step editor. It never asks for Alpaca credentials because Personal Paper mode reads the single pair from `.env`. Webhook, email, and Telegram each select the same alert and Bot Manager report event types independently. Each channel is validated only when its own enable control is on, so inactive channels never block saving another channel's preferences. Server environment variables only make a delivery channel available; they do not enable any notification preference by themselves. Webhook destinations are encrypted and never shown again. Telegram pairs the single Bot Manager session with a short-lived one-time code; the database stores only its hash and the internal paired chat identifier, neither of which is returned to the browser. After changing a server-side environment variable, restart both `web` and `worker` before status, polling, or delivery reflects it. It is reached through the top account menu, not the sidebar.
- `/settings` also contains the Admin-reviewed high-impact economic calendar. Every release requires an official HTTPS source URL and timestamp. The scheduler does not infer events from resource prose or external instructions: the deterministic `MACRO_EVENT_GUARD` blocks only a new `BUY` from ten minutes before until fifteen minutes after the event; it does not stop a `SELL` that reduces exposure.
- `/manager` — Admin-only **Bot Manager**. It has one pinned Operations transcript plus ordinary browser text conversations. It explains sanitized persisted operations. Both the browser and paired Telegram resolve the same explicit, exact-name `activate bot Name` / `turn off Name` request (Spanish equivalents plus `/on <bot-id>` / `/off <bot-id>`) to a durable ON/OFF proposal. Natural language is non-executing: the browser requires its confirmation button and Telegram requires a short-lived, single-use `CONFIRMAR <código>`. Confirmation enters the ordinary locked bot control and revalidates authorization, lifecycle, risk state, and Kill Switch before applying. Pending web proposals remain visible after reload. No chat can change capital, risk limits, settings, users, secrets, manual orders, or the Kill Switch independently of binary ON/OFF control.
- `/resources` — Admin-only URL resource library. It records all seven categories, source review state, bounded safe-extraction snapshots, hashes, errors, schedules, and immutable briefing citations. Its library remains visible while **New resource** and **Edit** use focused modals. It accepts public HTTPS URLs only; trusted registry domains auto-activate and unfamiliar domains remain inactive pending Admin approval. Editing a URL repeats that trust decision and resets its refresh state. There are no uploads, cookies, JavaScript execution, or resource-controlled trading actions. At 08:30 ET on an exchange day the worker creates one conservative briefing, then one immutable `DailyBotInput` per living bot. Expanded briefing history visibly lists the recommendations supplied to each bot; the input contains only fixed cautious recommendations plus source category/host/hash citations, never raw fetched text. It can only caution or defer the optional AI advisory and never creates a signal, increases size, relaxes a limit, overrides risk, or submits an order.
- `/status` — Admin-only operational status page, reached through the top account menu. It performs live checks for MySQL, the worker heartbeat and Alpaca Paper, reports ON/OFF/DEAD bot counts, and accurately labels OpenAI, SMTP, webhooks, and Telegram as disabled, configured, warning, or unavailable. A durable OpenAI quota/billing rejection pauses the global advisory circuit and appears as a warning. Only in that state the page offers an Admin **Check budget & reactivate AI** control; it sends one minimal, non-trading availability request and reopens advisory only on success. It never estimates an OpenAI balance or displays credentials, webhook URLs, recipients, Telegram chat identifiers, provider payloads, or account identifiers.
- `GET /api/status` — public, unauthenticated JSON equivalent for uptime checks and automations. It returns an overall `healthy`/`warning`/`unavailable` state, check time, aggregate bot counts, and the same sanitized service states as `/status`; it must never add credentials, webhook destinations, recipients, account IDs, database URLs, or raw exception details.
- `/admin/users` — Admin user CRUD, reached through the top account menu.
- `/account/password` — password change.

The sidebar is fixed on desktop and contains only operational navigation: Dashboard, History, and Bots for Admins. The compact top account menu contains the signed-in identity, Settings and Users for Admins, password management, and sign-out. New pages should use `AppNavigation` and the `shell appContent` layout rather than a back-to-dashboard link.

Bot creation must show the selected wallet's unallocated capital before submission. The UI blocks an over-budget or zero-budget allocation and explains how to free or provide capital; it must never leave the user with a raw `INSUFFICIENT_UNALLOCATED_CAPITAL` code. More than one independently funded bot can be powered on in the same wallet.

The bot modal is a three-step wizard. Navigation is non-persistent: it must never save or close because the user presses Enter in a field. Only the explicit final Create/Save button may persist the bot and close the modal.

## Implemented market and execution foundation

- The worker owns one persistent Alpaca IEX WebSocket for the union of active enabled bot watchlists plus `SPY`/`QQQ`. It persists immutable market events plus completed one-minute bars, updates subscriptions as active watchlists change, writes a durable authenticated stream heartbeat, and reconnects with bounded exponential backoff. The browser never connects to Alpaca.
- The worker runs a leased `market-cycle` once per minute. It checks the one Alpaca Paper market clock, reconciles the global account once, loads all active bots, and uses REST backfill plus latest quotes for the union of permitted symbols and `SPY`/`QQQ`. REST is the gap-recovery path; the shared evaluation remains idempotent. Every open-market cycle writes a durable, per-bot `BotScanRun` with safe English outcomes; closed-market/no-symbol waits are recorded at most hourly. A worker retention task removes scan rows older than 30 days.
- Only completed candles are persisted/evaluated. `MarketEvaluation.evaluationKey` makes an evaluation idempotent per bot, symbol, timeframe, and candle timestamp.
- `trend-v1` is deterministic: EMA trend, RSI, ATR, momentum, relative volume, and SPY/QQQ regime create `BUY`, `SELL`, or `HOLD`. Each pass persists a market snapshot and strategy signal.
- An eligible `BUY`/`SELL` candidate may receive an optional OpenAI advisory review. The adapter receives a redacted market/signal context, uses structured output, is rate-limited per bot, and records model, request, response, token use, cost estimate, or sanitized failure. A confirmed provider quota/billing rejection persistently pauses advisory calls globally, so retries do not spend more tokens; an Admin can reopen it only after a minimal availability check succeeds. It may only veto (`REJECT`) a candidate. `PROCEED`, `CAUTION`, timeout, malformed output, or provider failure never approve risk or submit an order; the deterministic path continues to the existing risk engine.
- A candidate not vetoed by AI goes through the existing risk engine, then an idempotent execution job. `client_order_id` is recovered from Alpaca before a retry submits an order.
- Reconciliation records broker snapshots and terminal fills. Virtual cash, reservations, and `BotPosition` are attributed to exactly one bot; a zero-cash bot with no remaining position becomes permanently `DEAD`, is switched OFF, and retains its trace.

The design intent is survival, not maximum activity: no strategy, prompt, or profile can bypass risk, capital isolation, the kill switch, or permanent death semantics.

## What is deliberately not finished

Do not claim these exist or wire placeholders that imply they do:

1. A reproducible backtest runner. Persistent Alpaca WebSocket streaming is implemented as one worker-owned connection with durable heartbeats, bounded reconnects, and REST backfill; the shared minute cycle remains the idempotent decision path.
2. Browser-RAG, memory retrieval, a bot learning loop, paid/editorial-source ingestion, or automatic model escalation. The implemented OpenAI advisory is optional, rate-limited, auditable, and cannot gain execution authority.
3. A broader Manager action surface. The only implemented action workflow is exact-name, one-bot ON/OFF proposals from either web or paired Telegram, with channel-specific human confirmation and locked execution revalidation; conversations cannot modify budget, limits, Kill Switches, instructions, or orders.
4. Automatic third-party economic-calendar ingestion. The staging-safe implementation is the visible Admin-reviewed official calendar and its durable deterministic macro execution guard; daily bot inputs remain conservative advisory context and are never a risk/execution authorization.

## Next product milestones

Prioritize in this order unless the user explicitly reprioritizes:

1. Add reproducible backtests without weakening the existing stream, REST-backfill, and evaluation safeguards.
2. Add richer per-bot decision reports and portfolio/P&L views.
3. Add a read-only contextual chat over an existing decision/analysis record.
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
