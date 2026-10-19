# Testing

## Commands

| Command | What it does |
| --- | --- |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests (happy-dom + WXT `fakeBrowser`) |
| `pnpm typecheck` | `wxt prepare && tsc --noEmit` |
| `pnpm lint` | ESLint (typescript-eslint strict) |
| `pnpm build:firefox` / `pnpm build:chrome` | Production builds into `.output/firefox-mv3` / `.output/chrome-mv3` |
| `pnpm lint:ext` | `web-ext lint` on the Firefox build (run after `build:firefox`). One known warning, `UNSAFE_VAR_ASSIGNMENT` about `innerHTML` in Preact's bundled `jsx-runtime`, is harmless: Sitecatch never uses `dangerouslySetInnerHTML`. It is a warning, not an error, so `pnpm check` stays green. |
| `pnpm check` | All of the above: typecheck + lint + test + build:firefox + lint:ext. **Must be green before merging.** |
| `pnpm dev:firefox` / `pnpm dev` | Dev build with live reload in Firefox / Chrome (opens a browser window) |
| `pnpm zip:firefox` / `pnpm zip:chrome` | Store-ready zips in `.output/` (gitignored) |
| `pnpm icons` | Re-rasterizes `assets/icon.svg` into `public/icon/*.png` (dev only) |

## Unit test strategy

Tests sit next to the code as `*.test.ts`. Most logic is written as pure functions so it can be tested without a browser. `browser.*` is replaced by WXT's `fakeBrowser`, and `fetch` is mocked.

| Area | What to test |
| --- | --- |
| Notion client (`lib/notion`) | Mocked `fetch`: headers (`Notion-Version: 2026-03-11`, bearer), response → normalized types, error mapping (401, 403, 404, 400, 409, 5xx, network) to `AppError`, 429/529 with `Retry-After`, **no retry of `POST /v1/pages`**, multipart send (no manual `Content-Type`), pagination for search. |
| Extractors (`lib/extract`) | Each extractor against `RawPageData` fixtures (present / missing / fallback tags). Probe against happy-dom HTML fixtures. Deterministic `ctx.now`. |
| Restricted URLs (`lib/capture`) | Table-driven: `about:`, `chrome://`, `moz-extension://`, addons.mozilla.org, Chrome Web Store, PDF viewer, `view-source:`, reader mode → restricted with a reason. Normal http(s) → not restricted. |
| Screenshot sizing | Downscale/re-encode keeps the output under the limit, and warnings are set. |
| URL normalization (`lib/url`) | `utm_*` and fragment removed. Equivalent URLs compare equal. Different pages don't. |
| Compat matrix (`lib/extract/compat-table.ts`, `lib/presets/compat`) | Every `ValueKind` → allowed types exactly as in [preset-model.md](./preset-model.md#compatibility-matrix); `ExtractorDef.compatible` matches the table. |
| Preset validation | Schema fixtures: missing, renamed, type-changed, option-missing (select vs status). `PresetIssue.blocking` as documented. Screenshot reference blocks; dedupe reference never blocks ("Duplicate check is off"). |
| Import/export | Envelope checks, bad files rejected whole, token never present. |
| Property builders (`lib/properties`) | Each writable type's JSON shape, 2000-char chunking, 100-element cap, comma sanitizing for select names, files (upload vs external). |
| Save pipeline | Mocked Notion: order is validate → upload (once) → create/update. The same upload id is used for files/cover/body. Update doesn't append a body image. Job state transitions in `storage.session`, `JobState.warnings`. Normalized URL written to the dedupe property only; dedupe skipped when its property is unusable. A create error doesn't retry; `committed_resource_id` and the recovery query. |
| Background integration (`background/integration.test.ts`) | Real router + handlers + Notion client, messages sent through `fakeBrowser.runtime.onMessage` with a popup sender, and a stateful fake Notion `fetch`: validate → `ds/list` → `ds/schema` → save with screenshot upload → job `done` with `pageUrl` → `dup/check` finds the page. Untrusted senders are ignored. |
| Messaging | `isRequest` guard. `sendRequest` turns transport failures into `AppError`s. Router sender rules (`isTrustedSender`). |
| UI kit / pages | Components (`SegmentedControl` keyboard and ARIA, `ErrorBanner` actions…), popup states, setup wizard, preset editor, import/export with Testing Library. |

## Manual E2E checklist

Run with a real Notion workspace. This doubles as the setup test: capture the setup screenshots (see the `<!-- SCREENSHOT: setup-N -->` markers in [setup-guide.md](./setup-guide.md)) while doing it.

**Install & setup**

- [ ] `pnpm build:firefox`, then load `.output/firefox-mv3` via `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `manifest.json`. The options wizard opens.
- [ ] Install prompt / permissions show only api.notion.com + data collection (browsing activity, website content).
- [ ] **Personal access token** (default): create one following the wizard. Paste an **invalid** token → clear error. Paste the valid one → bot + workspace shown. "Your databases" lists the databases you can open, without any sharing.
- [ ] **Internal connection**: re-run setup with a connection token. Share 2 databases ("Resources", "Fav websites") → both listed. Unshare one → it disappears. With none shared, the empty-state help shows.
- [ ] Revoke api.notion.com access in `about:addons` → wizard/popup show **Grant access**, and it works.

**Presets & saving**

- [ ] Build the "Resources" and "Fav websites" presets (see [preset-model.md](./preset-model.md#examples)).
- [ ] Save a site with each. In Notion, check properties, cover, body image, icon, and the screenshot in the files property. Dates with a time show in your local time zone. **Open in Notion** opens the right page in a new tab.
- [ ] Ask fields: required blocks Save. A new select/multi-select option is created.
- [ ] Re-save the same URL (also with `?utm_source=x` added) → duplicate banner. The URL property holds the normalized URL. Check **Update existing** (properties/cover replaced, no second body image), **Save as duplicate** (new page), **Open existing**.
- [ ] Close the popup mid-save → the page is still created and the badge shows ✓.
- [ ] Rename a mapped property in Notion → still saves, rename notice shown. Delete one / change its type → save blocked with **Edit preset**. Delete the dedupe property → "Duplicate check is off" notice, saving still works.
- [ ] Restricted pages (about:addons, addons.mozilla.org, a PDF, reader mode) → notice + URL/title fallback saves.
- [ ] Export presets → delete them → import → identical. Exported file contains no token.
- [ ] Offline / airplane mode → network error with retry.

**Chrome smoke test**

- [ ] `pnpm build:chrome`, load `.output/chrome-mv3` unpacked (`chrome://extensions` → Developer mode → Load unpacked). Setup + one save with screenshot works.

**Still unverified against real browsers / Notion** (check explicitly)

- [ ] Duplicate query with a `url` property filter (`{"url": {"equals": …}}`) matches the saved page.
- [ ] Old links to `notion.so/profile/integrations` redirect to the Developer portal (`app.notion.com/developers/connections`), which the wizard and error messages now link to.
- [ ] **Open in Notion** (`target="_blank"` link in the popup) opens a new tab in Firefox and Chrome.
- [ ] `activeTab` + `tabs.captureVisibleTab` work from the Firefox MV3 popup (fallback: optional `<all_urls>` at capture time).
