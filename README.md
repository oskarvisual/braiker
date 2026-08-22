# BrAIker

BrAIker is a **paper-only**, multi-user trading-control application for US stocks and ETFs through **Alpaca Paper**. It uses Next.js, TypeScript, Prisma, and a dedicated MySQL 8 database.

This repository is under active construction. Read [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) before making product or implementation decisions, then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before touching data, worker, broker, or API code. Those documents distinguish implemented behavior from planned work.

## Product rules that cannot be weakened

- Alpaca Paper is the only supported broker and environment. Live trading, crypto, Binance, margin, shorting, options, leverage, and extended-hours trading are out of scope.
- A bot has isolated capital. It may never use another bot's allocation or the wallet's unallocated balance.
- Survival is mandatory, not a setting: the bot's capital is its oxygen. A zero-capital bot must become `DEAD` permanently and then cannot be switched on, edited, or deleted; its data is retained. The automatic zero-capital transition is documented below as an implementation gap.
- The user-facing bot control is one ON/OFF switch. There is no Simulation mode or exposed Paper-mode control. The old database enum value is legacy-only and must not be reintroduced in UI or API contracts.
- Personality changes decision style, never the safety boundary. Custom instructions cannot override risk checks or survival rules.
- Browser code never receives broker credentials. Do not log, return, commit, or place secrets in fixtures.

## Current implementation

Implemented today:

- Cookie-session authentication; Admin, Operator, and Viewer roles.
- Admin user management and password change flow.
- One server-only Alpaca Paper connection from `.env`, virtual wallets with a shared global capital pool, and scheduled global portfolio reconciliation.
- Admin-managed notification preferences with durable, de-duplicated webhook/email/Telegram delivery. Required-status outages, OpenAI quota/billing rejections, and Bot Manager reports are delivered only to the enabled channels that selected them, then retried at a bounded interval until delivery succeeds.
- Server-side `.env` values make a delivery channel available but never enable notification preferences; an inactive channel is neither validated nor used when saving the other channels. Restart both `web` and `worker` after changing a server-side environment value.
- Global, dismissible action feedback through toasts, so an error from a modal is never rendered elsewhere on the page.
- A fixed operational sidebar and a compact top account menu for Settings, user administration, password management, and sign-out.
- Dashboard with Alpaca equity/cash, a seven-day account chart, positions, broker orders, and allocated bot capital.
- Order-first History with lifecycle and bot filters, plus a per-bot modal with separate **Operations** and **Analysis activity** tabs. Each modal also exposes a deterministic, read-only survival indicator with native emoji and color; it never changes controls or execution, and does not mistake capital that is invested or reserved for a loss. Analysis records explain completed, skipped, and failed cycles in plain English even when no order is placed; retained scan activity is pruned after 30 days.
- Three bot profiles: Guardian, Navigator, Explorer; Admin-editable defaults for position, daily-loss, and trade-count caps, plus per-bot name, avatar, budget, symbols, instruction, and bounded risk limits.
- Atomic budget allocation and adjustments, per-bot capital events, cloning with source lineage, `DEAD`-state guards, concurrent ON/OFF control for independently funded bots, and audit logs.
- Persistent scheduler leases, health/readiness endpoints, Prometheus metrics, and a MySQL-backed worker heartbeat shared by web and worker containers.
- Admin-only **System status** page plus public `GET /api/status` JSON: live MySQL, worker-heartbeat and Alpaca Paper checks; bot counts; status for AI, SMTP, webhooks, and Telegram without exposing secrets; and an OpenAI warning after a durable provider quota/billing rejection. That rejection opens a persistent advisory circuit: AI stops receiving candidate calls until an Admin explicitly selects **Check budget & reactivate AI**. The one minimal, non-trading provider check must succeed before the circuit reopens; an unavailable or still-exhausted provider remains paused. BrAIker does not estimate or display an OpenAI account balance. A bot marked ON is eligible for the worker market cycle; it is not claimed to be evaluating while the worker heartbeat is stale. The public endpoint is for uptime automation and returns only the already-sanitized aggregate state.
- **Bot Manager** is an Admin-only operational chat for explanations of scans, decisions, orders, bot health, and Paper-account activity. It has a pinned Operations transcript plus ordinary browser conversations. The Operations transcript receives enabled Telegram alerts and paired inbound Telegram messages; browser messages and replies sent from that pinned transcript are mirrored to the paired Telegram chat. Incoming Telegram messages and their replies are persisted in that same transcript and rehydrate in the web view on focus and every five seconds. Ordinary browser conversations remain web-only. Both web and paired Telegram resolve an explicit, exact-name `activate bot Name` / `turn off Name` request (Spanish equivalents and `/on <bot-id>` / `/off <bot-id>` also work) into the same durable ON/OFF proposal; web requires the confirmation button and Telegram requires one-time `CONFIRMAR <código>`. A Manager request of `Note for <exact bot name>: …` / `Nota para <nombre exacto>: …` creates a visible **local** bot-chat session and cautious context for that New York market day; it is never mirrored into Telegram and cannot create or relax a trade. Neither channel executes natural language directly; confirmation re-enters the normal locked bot-control service, which revalidates permissions, lifecycle, risk state, and Kill Switch. Pending web confirmations survive a page reload. No chat can change capital, risk limits, users, secrets, settings, manual orders, or the Kill Switch independently of the binary ON/OFF control.
- Admin-managed **Macro safety guard** persists official high-impact economic-release timestamps and source URLs. It rejects only new `BUY` proposals from ten minutes before until fifteen minutes after the release, while allowing risk-reducing `SELL`s. The deterministic risk decision records the guard rejection; it is not an AI or resource-page instruction.
- Admin-only **Resources** (`/resources`) is a URL-only, auditable source library with seven categories, safe HTTPS extraction, source state, snapshots/hashes, and immutable pre-market briefing history. The worker refreshes only active sources and produces a conservative cited briefing at 08:30 ET on exchange days, then creates one immutable, per-living-bot daily input with visible recommendations and source category/host/hash citations. That input can only add caution or defer a candidate in the optional AI advisory; it cannot create signals, increase size, relax risk, or submit orders. The third **Chats** tab in a bot’s history is a web-only, user/bot-isolated collection of sessions. It is locked unless the bot is actively running. A user may begin a message with `Important:` / `Importante:` to persist bounded, day-only caution alongside the immutable briefing; this can only defer or block an AI-advisory candidate, never create one or loosen any control.
- A shared, once-per-minute market cycle for ON bots: Alpaca IEX minute bars and quotes are persisted, closed candles are deduplicated, each bot is evaluated once per candle, and durable per-bot activity verifies what the worker did before a trade exists.
- Deterministic `trend-v1` strategy with EMA, RSI, ATR, momentum, relative-volume, and SPY/QQQ regime context. It produces auditable `BUY`, `SELL`, or `HOLD` signals. Optional OpenAI advisory review runs only for candidate `BUY`/`SELL` signals; it may veto a candidate but can never approve risk, raise limits, size an order, or submit one.
- English decision reports connect market snapshot → deterministic signal → optional AI advisory → risk decision → execution → fills. They are linked from History and each bot's order history.
- Paper-only proposal → risk decision → idempotent Alpaca order flow. Confirmed terminal broker outcomes reconcile fills, per-bot virtual cash, reservations, bot positions, capital events, and permanent death safeguards.
- Security boundaries: realized daily/weekly loss is calculated from durable attributed fills; virtual-capital reservations use an atomic MySQL condition; terminal reconciliation and Kill Switch/order submission share row-lock boundaries; temporary passwords cannot access privileged APIs; login attempts are throttled; and metrics require an Admin session or bearer token.

Not implemented yet:

- Autonomous learning, paid/editorial-source ingestion, and automatic model escalation. The optional OpenAI trade-advisory adapter, Bot Manager, URL-only resource library, and individual bot chats remain deliberately non-privileged.
- Automatic third-party calendar ingestion. Staging uses the visible, Admin-reviewed official-event calendar instead of scraping editorial calendars; its deterministic 10-minute-before/15-minute-after execution guard is already active.
- Live trading or any broker besides Alpaca Paper.

Turning a bot ON permits the worker's shared market cycle to evaluate its configured symbols. A trade is still possible only when the deterministic strategy produces a candidate, the optional AI advisory does not veto it, and the persisted risk engine approves it. This remains Alpaca Paper only.

## Personal Paper wallet model

Personal mode has exactly one Alpaca Paper account. `ALPACA_API_KEY` and `ALPACA_API_SECRET` are read only by server-side code from `.env`; BrAIker never asks for them when creating a wallet.

- A **wallet** is a virtual portfolio inside BrAIker, not another Alpaca account.
- **Global Paper capital** is the safety envelope enabled for BrAIker. It is capped by the Paper account's reported cash when changed in Settings.
- Creating a wallet reserves part of the currently unassigned global capital. Bots then reserve capital only inside their own wallet.
- Settings can add capital to a wallet from the global pool or release only that wallet's unassigned capital back to the pool. Capital already assigned to bots cannot be released until it is returned by the relevant bot.
- Settings can edit the three starting limits of each personality for future bots. Existing bots keep their stored policy until their own configuration is saved; the editor may then set those three limits up to the current personality default. Permanent paper-only safety boundaries remain fixed.
- This accounting does not move money at Alpaca. Reconciliation reads the single broker account once and attributes BrAIker orders to their originating bot/wallet through the internal order trace.

## Requirements

- Node.js 20.11+
- MySQL 8.0+, InnoDB, UTF-8 (`utf8mb4`), and a dedicated BrAIker database
- A least-privilege MySQL application user
- Docker is optional for deployment

## Local setup

1. Create local configuration without committing it:

   ```bash
   cp .env.example .env
   ```

2. Fill `.env`. Keep `TRADING_MODE=paper` and the exact Alpaca Paper base URL. Generate:

   - `APP_ENCRYPTION_KEY`: base64-encoded, random 32 bytes
   - `SESSION_SECRET`: a separate long random value
   - Bootstrap Admin credentials for the first worker boot
   - Optional `TELEGRAM_BOT_TOKEN` only after creating and securely storing a replacement BotFather token; it is read by the worker and never stored in MySQL

3. Generate Prisma client and apply migrations. For an existing development database use `prisma migrate dev`; production uses `npm run prisma:migrate`.

   ```bash
   npm run prisma:generate
   npx prisma migrate dev
   ```

4. Start the web app and worker in separate terminals:

   ```bash
   npm run dev
   npm run dev:worker
   ```

5. Sign in at `http://localhost:3000/login`. The worker creates the bootstrap Admin only when it does not already exist. Change its temporary password immediately.

## Essential commands

```bash
npm run test
npm run test:integration # requires BRAIKER_TEST_DATABASE_URL for an isolated disposable MySQL database
npm run typecheck
npm run build
npm run prisma:generate
npx prisma validate
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run paper:soak:check
```

When the local web app uses another port, set `BRAIKER_URL` first; for example: `BRAIKER_URL=http://localhost:3001 npm run paper:soak:check`.

## Project map

| Area | Location |
| --- | --- |
| Pages and HTTP endpoints | `src/app/` |
| Shared UI | `src/components/` |
| Domain modules | `src/modules/` |
| Worker process | `src/worker/main.ts` |
| Prisma schema and migrations | `prisma/` |
| Environment validation | `src/lib/env.ts` |
| Engineering rules | `AGENTS.md` |
| Product truth / handoff | `docs/PROJECT_CONTEXT.md` |
| Architecture and data contracts | `docs/ARCHITECTURE.md` |
| Local Paper soak procedure | `docs/PAPER_SOAK_RUNBOOK.md` |

## Quality gate

Every code change follows [`AGENTS.md`](AGENTS.md). Before marking work complete, run:

```bash
npm run test
npm run typecheck
npm run build
```

Schema changes additionally require `npm run prisma:generate` and `npx prisma validate`.

Material changes must also update the repository handoff through the [`braiker-documentation` skill](docs/skills/braiker-documentation/SKILL.md). It prevents the documentation from drifting away from the implemented product.

## Deployment

`docker compose up -d --build` runs only `web` and `worker`; MySQL remains external and is referenced by `DATABASE_URL`. Backups, TLS to MySQL, firewalling, secret management, and external uptime monitoring remain deployment responsibilities.

The Docker build context is intentionally filtered by `.dockerignore`: `.env`, `.env.*`, `.next`, `dist`, local dependencies, VCS metadata, and logs never enter an image build context. Supply runtime secrets through the deployment platform only.

For DigitalOcean App Platform, use [`app.staging.yaml`](app.staging.yaml) from the `staging` branch as the reproducible Paper-staging template: a public `web` service, one worker with `/healthz`, and a `PRE_DEPLOY` Prisma migration job. The same Docker image is verified locally for web, worker, and migration commands. Inject all environment values as App Platform secrets, use managed MySQL with tested PITR/backups, and keep exactly one worker instance during the Paper soak. Follow [`docs/PAPER_SOAK_RUNBOOK.md`](docs/PAPER_SOAK_RUNBOOK.md) for the account-side creation and final acceptance checks.
