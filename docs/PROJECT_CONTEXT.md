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
5. Broker credentials are encrypted with AES-256-GCM in application storage. They never reach the browser, logs, AI providers, tests, or committed files.
6. Risk and kill-switch checks are enforced before execution. An execution retry must be idempotent through proposal/job state and Alpaca `client_order_id` lookup.

## Bot model

### Personality profiles

There are exactly three initial personalities. Their risk caps are upper bounds; a bot may be configured lower but never higher.

| Profile | Intent | Max position | Max trades/day |
| --- | --- | ---: | ---: |
| Guardian | Conservative, stronger confirmation | $5 | 2 |
| Navigator | Balanced, moderate exposure | $10 | 4 |
| Explorer | Dynamic, more candidates inside strict limits | $15 | 6 |

The user may create multiple bots from the same personality, assign each a name, and add per-bot instructions. These instructions are stored as configuration/memory but must never change the risk boundary.

### Capital, survival, and death

- A wallet has `managedCapital` and `unallocatedCapital`.
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
- `/activity` — order-first History. It filters by lifecycle (`Open`, `In progress`, `Closed`, `Rejected`), bot, and symbol/status text. BrAIker orders link to `/bots/[botId]`; Alpaca orders without an internal link are explicitly shown as external/no bot linked.
- `/bots/[botId]` — read-only bot detail: configured universe, capital/status, and that bot's recorded BrAIker orders. A dead bot remains history-only.
- `/settings` — Admin wallet connection/configuration, sync interval, alert preferences, and profile reference cards. Webhooks and email each choose their destination and alert events independently. Webhook destinations are encrypted and never shown again. It is reached through the top account menu, not the sidebar.
- `/admin/users` — Admin user CRUD, reached through the top account menu.
- `/account/password` — password change.

The sidebar is fixed on desktop and contains only operational navigation: Dashboard, History, and Bots for Admins. The compact top account menu contains the signed-in identity, Settings and Users for Admins, password management, and sign-out. New pages should use `AppNavigation` and the `shell appContent` layout rather than a back-to-dashboard link.

Bot creation must show the selected wallet's unallocated capital before submission. The UI blocks an over-budget or zero-budget allocation and explains how to free or provide capital; it must never leave the user with a raw `INSUFFICIENT_UNALLOCATED_CAPITAL` code. More than one independently funded bot can be powered on in the same wallet.

The bot modal is a three-step wizard. Navigation is non-persistent: it must never save or close because the user presses Enter in a field. Only the explicit final Create/Save button may persist the bot and close the modal.

## What is deliberately not finished

Do not claim these exist or wire placeholders that imply they do:

1. Market stream manager, bar persistence/backfill, indicators, strategies, or a backtest runner.
2. Automated proposal generation. The execution path exists for future approved proposals, but the current UI does not generate them.
3. Automatic capital accounting that transitions a zero-capital bot to `DEAD`. The schema, pure `botLifeStatus` policy, and operational guards exist, but no current service persists this transition yet.
4. AI analysis, OpenAI adapter, RAG, bot conversation, memory retrieval, cost tracking, or bot learning loop.
5. Decision reports beyond the current order history: explainable decision snapshots, proposals/risk reasoning, and richer portfolio/P&L reporting per bot.
6. Alert delivery. Notification preferences and destinations are persisted now, but no worker dispatches webhook/email messages until durable event semantics and delivery/retry handling are implemented. SMTP configuration remains environment-only.

## Next product milestones

Prioritize in this order unless the user explicitly reprioritizes:

1. Add a carefully scoped strategy/market-data foundation with reproducible data and no order submission by default.
2. Add decision traceability: market snapshot → indicators → deterministic signal → risk decision → execution lifecycle.
3. Add notification delivery only after durable event semantics exist.
4. Add richer per-bot decision reports and portfolio/P&L views.
5. Add optional AI analysis behind validated, auditable, non-privileged adapters.

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
