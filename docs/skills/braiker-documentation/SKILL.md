---
name: braiker-documentation
description: Keep BrAIker's repository handoff documentation accurate whenever a material product, architecture, safety, operational, or user-facing change is made.
---

# BrAIker documentation synchronization

Use this skill for every material change in BrAIker. The outcome is that a new AI or engineer can understand the repository without relying on chat history, screenshots, or guesses.

## Read first

Read these before deciding what must change:

1. `README.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/ARCHITECTURE.md` when the change touches data, APIs, worker, scheduler, broker, execution, security, or deployment.

## Documentation is part of the change

Before declaring implementation complete, synchronize the relevant documents in the same change. Do not defer documentation as cleanup.

| Change | Required documentation update |
| --- | --- |
| User-facing capability, page, navigation, control, workflow, status, or limitation | `README.md` and/or `docs/PROJECT_CONTEXT.md` |
| Product rule, risk rule, bot lifecycle, permission, capital behavior, or scope decision | `docs/PROJECT_CONTEXT.md`, plus `README.md` when it changes the project summary |
| API, Prisma model/migration, worker, scheduler, broker, secrets, environment, deployment, or observability | `docs/ARCHITECTURE.md`, plus `README.md` when setup or project map changes |
| Test policy or acceptance requirement | `AGENTS.md` |
| New durable cross-cutting instruction | this skill and the `Required project reading` section of `AGENTS.md` |

For a narrowly internal refactor with no changed behavior, architecture, contract, setup, or limitation, do not create artificial documentation churn. State in the final handoff: “Documentation reviewed; no update was required.”

## Accuracy rules

- Separate **implemented now**, **partially implemented**, and **planned** behavior. Never let a data model, placeholder, environment variable, or mock UI be described as a working feature.
- When discovering a gap between intended and actual behavior, document it immediately as a current limitation and do not hide it.
- Preserve the paper-only boundary, isolated bot capital, mandatory survival semantics, permanent dead-bot behavior, and single public ON/OFF control.
- Never copy passwords, broker keys, encryption keys, database credentials, emails, account IDs, or production-like values into documentation.
- Keep names, routes, scripts, environment variables, model names, and state transitions aligned with the repository.

## Completion check

1. Search the documentation for stale UI labels, replaced control names, and contradicted claims.
2. Confirm all changed commands, routes, variables, and model names exist in the codebase.
3. Run the normal quality gate for code changes from `AGENTS.md`.
4. In the final handoff, list the documentation files changed, or explicitly state that the change required none.
