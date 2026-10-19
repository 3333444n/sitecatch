# Contributing to Sitecatch

Thanks for helping! Short version below. Details live in [`/docs`](docs/README.md) and [AGENTS.md](AGENTS.md).

## Setup

Node 24 (`.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm dev:firefox   # or: pnpm dev (Chrome)
```

## Workflow

- Never commit to `main`. Use a branch, ideally in its own worktree:
  ```sh
  git worktree add ../sitecatch-wt/<name> -b <type>/<name>   # e.g. feat/tech-extractor, fix/dup-check
  ```
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Keep commits small.
- Run **`pnpm check`** before opening a PR (typecheck, lint, tests, Firefox build, web-ext lint). `web-ext lint` reports one known warning about `innerHTML` in Preact's bundled `jsx-runtime`; it's harmless and not an error.
- Open a pull request against `main` on [GitHub](https://github.com/3333444n/sitecatch). The maintainer reviews and merges; nothing is merged into `main` locally.
- Contract files (types, the extractor compatibility table, messaging protocol, storage items, errors, theme tokens) are shared interfaces. Propose changes in an [issue](https://github.com/3333444n/sitecatch/issues) or PR description first. See [AGENTS.md](AGENTS.md#contract-files-frozen).

## Docs

`/docs` is the source of truth. If you change behavior, update the matching doc in the same PR. Larger decisions get an ADR in [docs/decisions/](docs/decisions/README.md).

## Common tasks

- Add an extractor: [docs/extractors.md](docs/extractors.md#adding-an-extractor)
- Testing approach and manual checklist: [docs/testing.md](docs/testing.md)
- Change the icon: edit `assets/icon.svg`, then `pnpm icons`
- Release a signed Firefox build (maintainer): [docs/releasing.md](docs/releasing.md)
- Setup screenshots: `public/setup/setup-N.png` ([capture checklist](docs/setup-guide.md#screenshots-to-capture))

## Code of conduct

Be kind, assume good faith, and keep discussions about the work. Harassment of any kind isn't tolerated.
