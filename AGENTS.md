# AGENTS.md

**Sitecatch** — an open-source (MIT), Firefox-first browser extension (WXT + TypeScript + MV3, Preact) that saves websites into Notion databases via user-defined presets, using the official Notion API and a user-supplied integration token. No backend.

## Source of truth

`/docs` is the source of truth. **Read [docs/README.md](./docs/README.md) first**, then the docs relevant to your task. If code and docs disagree, raise it; if you change behavior, update the docs in the same branch.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install deps (runs `wxt prepare`) |
| `pnpm dev:firefox` / `pnpm dev` | Dev build with live reload (Firefox MV3 / Chrome) |
| `pnpm build:firefox` / `pnpm build:chrome` | Production build into `.output/<browser>-mv3` |
| `pnpm zip:firefox` / `pnpm zip:chrome` | Store-ready zips |
| `pnpm test` / `pnpm test:watch` | Vitest (happy-dom + WXT fake browser) |
| `pnpm typecheck` | `wxt prepare && tsc --noEmit` |
| `pnpm lint` | ESLint (flat config, typescript-eslint strict) |
| `pnpm lint:ext` | `web-ext lint` on the Firefox build |
| `pnpm check` | typecheck + lint + test + build:firefox + lint:ext |

Toolchain: Node 24 (`.nvmrc`), pnpm 10.

## Workflow

- Never work on `main`. Each task gets its own worktree and branch:
  `git worktree add ../sitecatch-wt/<name> -b <type>/<name>` (e.g. `feat/notion-client`, `fix/dup-check`, `docs/setup-guide`).
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Small, focused commits.
- **File ownership:** only edit files/directories assigned to your task. If you need a change elsewhere, note it in your report instead of making it.
- Don't push unless told to; the orchestrator reviews and merges.

## Contract files (frozen)

These define the shared interfaces between modules. **Change only via the orchestrator** — implement against them, don't edit them. If one is wrong or missing something, report it.

- `src/lib/errors.ts` — `AppError`, `AppErrorCode`, `Result<T>`, `ok()`, `err()`
- `src/lib/notion/types.ts` — normalized Notion types (property types, data source schema, page refs, duplicates) and page request bodies (`NotionPropertyValue`, `PageExtras`, `NotionCreatePageBody`/`NotionUpdatePageBody`)
- `src/lib/extract/types.ts` — extractor ids, `RawPageData`, `ExtractorDef`, `ExtractedValue`, `CaptureResult`
- `src/lib/extract/compat-table.ts` — `VALUE_KIND_TARGETS`, the single extractor-output → property-type compatibility table
- `src/lib/presets/types.ts` — `Preset`, `Mapping`, `ValueSource`, `FormValue(s)`, `PresetIssue`
- `src/lib/messaging/protocol.ts` and `src/lib/messaging/client.ts` — request/response map, `Handlers`, `sendRequest()`
- `src/lib/storage/items.ts` — all storage item definitions
- `src/ui/theme.css` — design tokens

## Code conventions

- TypeScript `strict`; **no `any`** (use `unknown` + narrowing). Prefer pure functions; keep side effects at the edges.
- Use the `Result` envelope across every message boundary and for fallible library functions; background handlers never throw.
- **Never log, display, or persist the token** anywhere except `local:auth`. It is sent only to `api.notion.com`.
- **All Notion API calls happen in the background** (never from popup/options/content scripts).
- User-facing errors must be **actionable**: say what happened and what to do next (and set `action` when a UI affordance exists).
- UI: Preact + `@preact/signals`, plain CSS using the tokens from `src/ui/theme.css`. Import shared code with the `@/` alias (`src/`).
- Request the minimum permissions; no remote code, no analytics.

## Definition of done

- `pnpm check` is green.
- Tests added/updated for new logic (unit tests next to the code as `*.test.ts`).
- Relevant `/docs` pages updated.
- Report back: what changed, files touched, any contract-file change requests, open questions.
