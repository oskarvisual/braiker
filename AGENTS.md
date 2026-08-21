# Braiker engineering rules

## Required project reading

Before planning or implementing product behavior, read `README.md`, `docs/PROJECT_CONTEXT.md`, and `docs/skills/braiker-documentation/SKILL.md`. Before changing MySQL models, APIs, the worker, scheduler, broker integration, or execution code, also read `docs/ARCHITECTURE.md`.

Those documents are the current product handoff: they distinguish implemented behavior from future work and record the non-negotiable paper-only, isolated-capital, permanent-death, and ON/OFF bot-control rules. Do not invent unfinished features or reintroduce removed public controls.

## Documentation synchronization is mandatory

For every material product, user-facing, safety, API, data, worker, deployment, environment, or operational change, apply `docs/skills/braiker-documentation/SKILL.md` and update the relevant handoff documents in the same change. Documentation is a completion requirement, not follow-up work.

For a strictly internal refactor with no changed behavior or contract, review the documentation and state in the final handoff that no update was needed. Never add secrets, keys, credentials, account identifiers, or production-like values to repository documentation.

## Test-first is mandatory

Every behavior change starts with a failing automated test that states the intended outcome. Implement the smallest production change that makes it pass, then refactor only while the complete suite remains green. Do not add a feature, route, adapter, schema migration, or bug fix first and promise tests later.

The only exception is an exploratory spike explicitly marked as non-production; it must not be wired into the worker, dashboard, or execution path.

## Required test level by change

- **Domain logic:** unit tests in the same module (`*.test.ts`). Cover normal, boundary, and rejection paths.
- **Risk, execution, auth, state transitions, or Kill Switch:** unit tests plus negative/security cases. No change may weaken existing rejection tests.
- **Prisma repositories, leases, migrations, or transactions:** MySQL integration tests against an isolated test database. Never use the local `braikers` development database for automated destructive tests.
- **Alpaca/OpenAI adapters:** contract tests using recorded/sanitized fixtures for success, timeout, malformed response, duplicate event, and provider rejection.
- **API/dashboard flows:** end-to-end tests for authorization and the user-visible result.

## Financial-safety acceptance criteria

Changes that can create, approve, queue, or send an order must prove all of the following:

1. `TRADING_MODE=paper` is enforced and live endpoints are rejected.
2. The persistent Kill Switch rejects queued and newly-created execution work.
3. Risk rejection reasons are deterministic and persisted.
4. Reprocessing the same proposal cannot submit a duplicate Alpaca order.
5. Secrets never appear in API responses, logs, fixtures, snapshots, or assertions.

Use decimal strings/Prisma `Decimal` for money. Never use JavaScript floating-point arithmetic for persisted financial values.

## Test commands and gates

Before marking a change complete, run:

```bash
npm run test
npm run typecheck
npm run build
```

For schema changes, also run:

```bash
npm run prisma:generate
npx prisma validate
```

Do not skip, focus, delete, or weaken tests to make the suite pass. New bugs require a regression test.

## Fixtures and external systems

- Keep fixtures in `src/**/__fixtures__/` and sanitize every identifier, credential, and account value.
- Unit and contract tests must not call Alpaca, OpenAI, or another external service.
- Paper-account smoke tests are manual, explicitly named, and require dedicated test credentials.
- Never run tests against a live broker account or production database.

## Scope and review

Keep commits and changes narrow. Update this file only when the testing policy itself changes. If a requirement cannot be tested automatically, document the reason and the exact manual verification in the pull-request or handoff notes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
