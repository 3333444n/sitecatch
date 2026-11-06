<!-- Title: a Conventional Commit, e.g. "feat(popup): ..." or "fix(notion): ...". -->

## What and why

<!-- What changes, and why. Link the issue: "Closes #123". -->

## How it was tested

<!-- Unit tests added/updated, and any manual steps (browser + version). -->

## Checklist

- [ ] `pnpm check` is green (typecheck, lint, tests, Firefox build, web-ext lint)
- [ ] Tests added or updated for new logic (`*.test.ts` next to the code)
- [ ] Relevant `/docs` pages updated (and `CHANGELOG.md` under Unreleased for user-facing changes)
- [ ] Contract files (see [AGENTS.md](https://github.com/3333444n/sitecatch/blob/main/AGENTS.md#contract-files-frozen)) unchanged, or the change is explained below
- [ ] No new permissions, hosts, remote code or analytics, or they're justified below
- [ ] No tokens, keys or private data in code, tests, fixtures or screenshots

## Notes for the reviewer

<!-- Contract-file changes, open questions, follow-ups. -->
