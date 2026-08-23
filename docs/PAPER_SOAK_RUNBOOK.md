# Local Paper soak runbook

This runbook is for the Personal Paper deployment only. It is never a checklist for live trading.

## DigitalOcean staging creation

1. Push the repository's `staging` branch before creating the App. App Platform must be granted access to that GitHub repository and the app must use [`../app.staging.yaml`](../app.staging.yaml), whose web service, worker, and `PRE_DEPLOY` migration job all track that branch.
2. Create a dedicated DigitalOcean Managed MySQL database and a least-privilege application user. Enable backups and point-in-time recovery, then perform one restore test before enabling any bot. Do not reuse local or live databases.
3. Add every `BRAIKER_*` placeholder referenced by the spec as an App Platform secret. Keep `TRADING_MODE=paper` and the fixed Alpaca Paper URL. Use staging-only session/encryption keys and Paper-only Alpaca credentials. Add `APP_ORIGIN` as an app-level non-secret with the exact public HTTPS origin and no trailing slash; this is required for browser CSRF validation through App Platform. Do not place any secret in Git, the spec, browser fields, or logs. For a one-time local migration/status check, place only the staging `DATABASE_URL` in the Git-ignored `.env.staging`; App Platform runtime secrets remain in the platform.

## Manager-learning and macro-calendar staging smoke

After the App Platform `PRE_DEPLOY` migration completes, sign in as an Admin and verify:

1. Ask Bot Manager for market status. It must show Alpaca’s open/closed state and next open/close, or explicitly say the clock is unknown.
2. Ask about one exact bot name. Confirm the reply can reference bounded persisted scans, proposals/risk decisions, orders/fills, and positions without exposing credentials.
3. Send `Recordar para <nombre exacto>: esperar confirmación más fuerte`. Confirm an auditable internal revision exists, visible Additional instructions remain unchanged, and the same rule can be revoked through the protected learned-instructions endpoint.
4. Seed or observe three negative realized SELL fills for one bot/symbol within 30 days. Confirm this creates a pending learning proposal—not an active rule—and that a single loss creates nothing. With **Learning proposals** selected in paired Telegram, confirm it arrives there and resolves only through `APPROVE <proposal-id>` or `REJECT <proposal-id>`; otherwise confirm the `Learning · <bot>` Manager conversation appears with web controls.
5. Add an active, approved MACRO Resource, then send `Evento macro: título | 2026-09-10T08:30:00-04:00 | https://host-aprobado/ruta`. Confirm the event is HIGH, source/actor audited, and duplicate or unapproved-host commands do not create events.
6. In Settings, create a high-impact event with a longer protection window, then open **View calendar**. Verify active/future and past pagination are independent, empty tabs show an empty state without pagination, and neither view offers deletion. Values below 10/15 on that event must be rejected.

Keep the bot in Paper mode. A macro guard must reject only a new BUY; a reducing SELL remains permitted.
4. Create one App Platform application from the spec. It provisions **one App**, with three components: public `web`, private `worker`, and the `PRE_DEPLOY` migration job. It does not create two separate applications. Keep `instance_count: 1` for both web and worker through the soak.
5. Configure an independent external monitor to request the public `/api/status` endpoint once a minute and alert on any non-healthy response. App Platform liveness restarts the worker when `/healthz` fails; the external monitor is still required because a stopped worker or database cannot reliably send its own alert.
6. After the first deployment, confirm the migration job succeeded, `/api/health`, `/api/ready`, and `/api/status` are healthy, then run the First-day verification below before turning on a bot.

## Preconditions

1. Keep `TRADING_MODE=paper` and use only the Alpaca Paper base URL in `.env`.
2. Configure the one global `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `.env`. Never enter them in a virtual-wallet form.
3. Apply migrations and complete quality gates:

   ```bash
   npm run prisma:generate
   npx prisma validate
   npm run test
   BRAIKER_TEST_DATABASE_URL='<isolated disposable MySQL URL>' npm run test:integration
   npm run typecheck
   npm run build
   ```

4. Start exactly one web process and exactly one worker process. Do not run multiple workers during the soak unless the execution/lease behavior has been specifically tested for that topology.

## First-day verification

1. Run `npm run paper:soak:check` and verify `health`, `ready`, MySQL, `paper` mode, worker heartbeat, and the authenticated Alpaca market stream. If the worker or stream is stale, start exactly one worker with `npm run dev:worker` and wait for the next heartbeat before treating ON bots as evaluated. If BrAIker is running locally on port 3001, use `BRAIKER_URL=http://localhost:3001 npm run paper:soak:check`.
2. In Settings, set a deliberately small **Global Paper capital** envelope. It is an internal BrAIker limit and cannot exceed Alpaca's reported cash.
3. Create virtual wallets from that unassigned pool. Confirm that wallet totals plus unassigned capital equal the global envelope.
4. Create one bot with a small budget, a small allowed universe, and conservative limits. Turning it on permits analysis only when the market is open; it does not guarantee an order.
5. Open that bot's history modal and use **Analysis activity** to confirm a completed scan appears with the evaluated symbols and a plain-English result. When the market is closed, confirm the latest activity says it is waiting rather than reporting an error.
6. Run a dashboard sync. Confirm Alpaca cash/equity/positions load and the bot's virtual capital stays separate from the global account view.
7. For every submitted order, open its English Decision report from History or bot detail and verify the chain: market evaluation → strategy signal → optional AI advisory → proposal → risk decision → execution job → broker order → fill/capital event. Confirm the broker snapshot is attributed to the bot's virtual wallet.
8. If AI is enabled, confirm it is configured with a small per-bot daily cap, inspect one completed or failed advisory record in the Decision report, and verify that provider failure did not grant an approval or bypass risk.
9. In Settings, select `System status failure` and `OpenAI quota exhausted` for each alert channel you intend to use. Confirm the destination and SMTP configuration are correct before relying on them. Repeated failures are de-duplicated and failed deliveries retry after a bounded delay. Configure an independent uptime monitor to poll public `/api/status` once a minute: a stopped worker or unavailable database cannot send its own webhook/email alert.
10. On the next exchange day after 08:30 ET, open **Resources** and expand the daily briefing. Confirm it records the cited sources and shows one immutable recommendation set for every living bot. A recommendation may only caution or defer an optional AI advisory; confirm the deterministic signal, risk limits, position size, and order path remain unchanged.
11. In Settings, record the upcoming official high-impact releases (for example, CPI, employment, PCE, GDP, and FOMC) with their release timestamps and source URLs. During a release-window test, confirm the Decision report rejects a new BUY with `MACRO_EVENT_GUARD` while a valid SELL remains eligible to reduce exposure.
12. In a disposable Paper bot, enable **Adaptive risk limits**. Confirm its three manual inputs are hidden, then use an isolated fixture or safe test data to simulate a realized liquid-capital drawdown below 85% and below 50%. Confirm the history records `CAUTIOUS` then `PROTECTIVE` effective limits, each no higher than the saved envelope; deployed/reserved capital must retain the baseline posture.

## Daily checks during the soak

- Review `/api/ready`, `/api/status`, worker heartbeat, market-stream heartbeat, and worker logs at least once each market day. `Configured` for OpenAI is informational: it never proves a provider request and becomes relevant only for eligible candidate signals. A warning means BrAIker recorded a provider quota/billing rejection; this is not an account-wide remaining-dollar balance. Advisory remains globally paused until an Admin uses **Check budget & reactivate AI** on `/status`; the minimal availability request must succeed before it is enabled again. A stale market stream is a stop-and-investigate condition even though REST backfill may remain available.
- Review rejected proposals, failed execution jobs, and reconciliation changes. Do not ignore a failed or stale reconciliation.
- Verify each ON bot stays inside its virtual capital, position cap, daily-loss cap, and trade cap.
- Test the ON/OFF Kill Switch with a bot that has no in-flight order.
- Review the daily Resources briefing after 08:30 ET and compare its visible per-bot recommendations with the associated bot-chat explanation or advisory record. Treat missing, duplicated, or non-conservative daily inputs as a stop-and-investigate condition.
- Keep a single worker instance. Do not scale worker replicas while this is a one-account Paper soak.

## Stop conditions

Turn all bots OFF and investigate before continuing if any of these occurs:

- Alpaca reconciliation is unavailable or data is stale.
- An order cannot be attributed to exactly one BrAIker bot/wallet.
- A risk limit, Kill Switch, or capital isolation check behaves unexpectedly.
- An order appears duplicated, a broker status cannot be reconciled, or a worker crashes during execution.

## Current known gaps

- The isolated MySQL security suite covers competing reservations/reconciliations, realized loss windows, Kill Switch execution rejection, and Bot Manager transcript ownership/idempotency. It must use a disposable database only. Keep the manual checks above explicit during the soak, including the external monitor, broker reconciliation, and one-web/one-worker topology.

Do not promote this environment to live trading. A live deployment requires a separate app, database, secrets, security review, and its own soak period.
