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
- MySQL-backed wallets, encrypted Alpaca Paper connections, and scheduled portfolio reconciliation.
- Admin-managed alert preferences: independently selected webhook/email events, encrypted webhook destinations, and SMTP environment readiness.
- Global, dismissible action feedback through toasts, so an error from a modal is never rendered elsewhere on the page.
- A fixed operational sidebar and a compact top account menu for Settings, user administration, password management, and sign-out.
- Dashboard with Alpaca equity/cash, a seven-day account chart, positions, broker orders, and allocated bot capital.
- Order-first History with lifecycle and bot filters, plus a read-only per-bot detail/history page.
- Three bot profiles: Guardian, Navigator, Explorer; per-bot name, avatar, budget, symbols, instruction, and bounded risk limits.
- Atomic budget allocation and adjustments, per-bot capital events, cloning with source lineage, `DEAD`-state guards, concurrent ON/OFF control for independently funded bots, and audit logs.
- Persistent scheduler leases, health/readiness endpoints, Prometheus metrics, and worker heartbeats.

Not implemented yet:

- A market-data stream, strategy runner, backtesting, or automatic signal generation.
- The capital-accounting transition that automatically marks a zero-capital bot `DEAD`; the model and guards exist, but this transition is not yet wired into a capital update path.
- AI provider integration, RAG, bot chat, or autonomous learning.
- Decision reports beyond the implemented order lifecycle/history views, including explainable decision snapshots and richer per-bot portfolio/P&L reporting.
- Webhook/email alert delivery. Preferences and destinations can be configured, but delivery waits for durable event dispatch and SMTP configuration.
- Live trading or any broker besides Alpaca Paper.

Turning a bot ON currently changes its durable operating state; it does **not** by itself start an autonomous strategy or place an order.

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
npm run typecheck
npm run build
npm run prisma:generate
npx prisma validate
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

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
