# 0008. Agent worktree orchestration workflow

- Status: Accepted
- Date: 2026-10

## Context

Sitecatch is built mostly by AI coding agents running in parallel. Parallel agents in one checkout step on each other's files, and unclear interfaces lead to merge conflicts and drift.

## Decision

- An **orchestrator** (Claude) plans, writes only glue and the **frozen contract files** (types, messaging protocol, storage items, errors, theme tokens), reviews diffs, runs `pnpm check` and merges with `--no-ff`.
- Each task runs in its **own git worktree and branch** (`git worktree add ../sitecatch-wt/<name> -b <type>/<name>`). Nobody works on `main`.
- Each agent has **explicit file ownership**. Changes outside that area, or to contracts, are requested in the agent's report.
- Conventional Commits. `/docs` is the source of truth and is updated in the same branch as behavior changes.
- Phases: A (scaffold + contracts), B (parallel libs + docs), C (background, options, popup), D (integration + release).

## Consequences

- Parallel work without conflicts. Interfaces are fixed early.
- Contract changes go through one place, which can slow an agent down. The trade-off is intentional.
- Rules live in [AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md), so human contributors follow the same flow (branches + PRs).

## Update (2026-10-18)

The public repository now exists: <https://github.com/3333444n/sitecatch>. Phases A–D are done (v0.1.0). The orchestrator no longer merges into `main` locally: each feature branch (still one worktree per task) is pushed and opened as a **PR on GitHub** for the maintainer to review and merge. `pnpm check` must be green before the PR.
