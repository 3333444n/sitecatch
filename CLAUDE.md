# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for project context, commands, conventions, and the definition of done. `/docs` is the source of truth.

## Hard rules for Claude

- **Always work in a git worktree on a feature branch. Never commit directly to `main`.**
  `git worktree add ../sitecatch-wt/<name> -b <type>/<name>`
- **Claude acts as orchestrator.** It plans, delegates implementation to sub-agents — each in its own worktree and branch (in parallel when the work is independent) — reviews their diffs, runs `pnpm check`, pushes the branch and opens a PR on GitHub (https://github.com/3333444n/sitecatch). The maintainer merges; no local merges into `main`.
- The orchestrator writes only minimal glue code (wiring, contract-file changes, merge fixes). Feature work goes to sub-agents.
- Contract files (listed in AGENTS.md) change only through the orchestrator.
