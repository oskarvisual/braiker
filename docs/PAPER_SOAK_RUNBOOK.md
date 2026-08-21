# Local Paper soak runbook

This runbook is for the Personal Paper deployment only. It is never a checklist for live trading.

## Preconditions

1. Keep `TRADING_MODE=paper` and use only the Alpaca Paper base URL in `.env`.
2. Configure the one global `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `.env`. Never enter them in a virtual-wallet form.
3. Apply migrations and complete quality gates:

   ```bash
   npm run prisma:generate
   npx prisma validate
   npm run test
   npm run typecheck
   npm run build
   ```

4. Start exactly one web process and exactly one worker process. Do not run multiple workers during the soak unless the execution/lease behavior has been specifically tested for that topology.

## First-day verification

1. Run `npm run paper:soak:check` and verify `health`, `ready`, MySQL, and `paper` mode. If BrAIker is running locally on port 3001, use `BRAIKER_URL=http://localhost:3001 npm run paper:soak:check`.
2. In Settings, set a deliberately small **Global Paper capital** envelope. It is an internal BrAIker limit and cannot exceed Alpaca's reported cash.
3. Create virtual wallets from that unassigned pool. Confirm that wallet totals plus unassigned capital equal the global envelope.
4. Create one bot with a small budget, a small allowed universe, and conservative limits. Turning it on permits analysis only when the market is open; it does not guarantee an order.
5. Run a dashboard sync. Confirm Alpaca cash/equity/positions load and the bot's virtual capital stays separate from the global account view.
6. For every submitted order, verify the chain: market evaluation → strategy signal → proposal → risk decision → execution job → broker order → fill/capital event. Confirm the broker snapshot is attributed to the bot's virtual wallet.

## Daily checks during the soak

- Review `/api/ready`, worker heartbeat, and worker logs at least once each market day.
- Review rejected proposals, failed execution jobs, and reconciliation changes. Do not ignore a failed or stale reconciliation.
- Verify each ON bot stays inside its virtual capital, position cap, daily-loss cap, and trade cap.
- Test the ON/OFF Kill Switch with a bot that has no in-flight order.
- Keep a single worker instance. Do not scale worker replicas while this is a one-account Paper soak.

## Stop conditions

Turn all bots OFF and investigate before continuing if any of these occurs:

- Alpaca reconciliation is unavailable or data is stale.
- An order cannot be attributed to exactly one BrAIker bot/wallet.
- A risk limit, Kill Switch, or capital isolation check behaves unexpectedly.
- An order appears duplicated, a broker status cannot be reconciled, or a worker crashes during execution.

## Current known gaps

- Market collection is bounded REST polling; persistent Alpaca WebSocket reconnect/backfill telemetry is not yet implemented.
- The UI does not yet render the complete visual decision chain even though the records are persisted.
- Webhook/email preferences are stored, but durable notification delivery/retry is still pending.
- There is no automated isolated-MySQL integration suite or browser E2E suite yet; keep manual checks explicit during this local soak.

Do not promote this environment to live trading. A live deployment requires a separate app, database, secrets, security review, and its own soak period.
