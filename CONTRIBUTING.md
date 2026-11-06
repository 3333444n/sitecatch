# Contributing to Sitecatch

Thanks for helping! Short version below. Details live in [`/docs`](docs/README.md) and [AGENTS.md](AGENTS.md).

## Setup

Node 24 (`.nvmrc`, e.g. `nvm use`) and pnpm 10 (the exact version is pinned in `package.json` → `packageManager`; `corepack enable` picks it up).

```sh
pnpm install       # also runs `wxt prepare` (generates .wxt/ types)
pnpm dev:firefox   # or: pnpm dev (Chrome)
```

No secrets or accounts are needed to develop or run `pnpm check`. To try saving, use your own Notion token in the setup wizard ([setup guide](docs/setup-guide.md)). Only `pnpm sign:firefox` needs maintainer AMO keys; without them it stops with an error before doing anything.

## Workflow

- Outside contributors: fork the repo and open a PR from a branch in your fork. Maintainers and agents work on branches here.
- Never commit to `main`. Use a branch, ideally in its own worktree:
  ```sh
  git worktree add ../sitecatch-wt/<name> -b <type>/<name>   # e.g. feat/tech-extractor, fix/dup-check
  ```
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Keep commits small.
- Run **`pnpm check`** before opening a PR (typecheck, lint, tests, Firefox build, web-ext lint). `web-ext lint` reports one known warning about `innerHTML` in Preact's bundled `jsx-runtime`; it's harmless and not an error.
- Open a pull request against `main` on [GitHub](https://github.com/3333444n/sitecatch) and fill in the PR template (it mirrors the Definition of done in [AGENTS.md](AGENTS.md#definition-of-done)). CI runs `pnpm check` on every PR. The maintainer reviews and merges; nothing is merged into `main` locally.
- User-facing changes get an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Never commit tokens, AMO keys or `.env.local`. Test fixtures use obviously fake tokens (e.g. `ntn_testtoken…`).
- Contract files (types, the extractor compatibility table, messaging protocol, storage items, errors, theme tokens) are shared interfaces. Propose changes in an [issue](https://github.com/3333444n/sitecatch/issues) or PR description first. See [AGENTS.md](AGENTS.md#contract-files-frozen).

## Docs

`/docs` is the source of truth. If you change behavior, update the matching doc in the same PR. Larger decisions get an ADR in [docs/decisions/](docs/decisions/README.md).

## Common tasks

- Add an extractor: [docs/extractors.md](docs/extractors.md#adding-an-extractor)
- Testing approach and manual checklist: [docs/testing.md](docs/testing.md)
- Change the icon: edit `assets/icon.svg`, then `pnpm icons`
- Release a signed Firefox build (maintainer): [docs/releasing.md](docs/releasing.md)
- Setup screenshots: `public/setup/setup-N.png` ([capture checklist](docs/setup-guide.md#screenshots-to-capture))

## Code of conduct and security

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
