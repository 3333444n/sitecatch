# Sitecatch

**Collect websites into your Notion databases.**

Sitecatch is an open-source browser extension, built for Firefox first, that saves the page you're on into the Notion database you choose. It captures the screenshot, title, description, URL, fonts and more, and you decide which property gets what. It uses the official Notion API with your own token. There is no account, no backend and no tracking.

<!-- SCREENSHOT: hero — add a short popup GIF at assets/hero.gif (not shipped in the extension) and uncomment:
![Sitecatch popup saving a page to Notion](assets/hero.gif)
-->

> **Status:** [v0.1.0](CHANGELOG.md) (October 2026), early. Tested end to end in Firefox; the Chrome build isn't smoke-tested yet. There are no store listings yet: install from source, or install a signed `.xpi` in Firefox (see [Install](#install-from-source)). Source and issues: <https://github.com/3333444n/sitecatch>.

## Features

- **Presets per database.** Example: "Resources" fills Name, URL, Description, Type and Tags, and "Fav websites" fills Domain, Fonts and Rating. You can have as many presets as you like.
- **Per-property value sources**: extracted from the page (with fallbacks, e.g. Open Graph title → page title), **asked in the popup**, or a **fixed value**.
- **Screenshots**: into a files property, as the page cover, and/or as an image in the page body. Uploaded to Notion, no third-party hosting.
- **Cover & icon** from the page's Open Graph image and favicon.
- **Duplicate detection** by normalized URL (tracking parameters and `#fragments` ignored): update the existing page, save a duplicate, or open the existing one.
- **Editable form** before saving. The save keeps going in the background if you close the popup. When it's done you get **Open in Notion**, plus a note if anything was left out (e.g. a screenshot too large for your plan).
- **Guided setup wizard** for a personal access token or an internal connection, with exact steps and troubleshooting.
- Works on restricted pages (browser pages, stores, PDFs) with a URL/title fallback.
- Presets **sync** through your browser, with JSON **import/export**.
- Survives property **renames** (mapped by id) and warns when your database changes.

## Why Sitecatch

| | Sitecatch | Save.to | Notion Web Clipper (official) | Flylighter |
| --- | --- | --- | --- | --- |
| Source | Open source (MIT) | Closed source | Closed source | Closed source |
| Price | Free | Freemium (Pro $5.99/mo) | Free | Free tier + paid tiers |
| Connects via | Official Notion API, your own token | Your notion.so session | Your Notion login | — |
| Set property values when saving | Yes (extract / ask / fixed) | Yes | No | Yes |
| Screenshots | Yes (files, cover, body) | Yes | No | — |
| Highlights | Planned | Yes | No | Yes |
| Firefox | Primary target | Yes | Add-on removed from AMO (2026) | Beta only |

"—" means not verified. All of these are useful tools, and each has strengths. Sitecatch's angle is open source, the official API, minimal permissions and Firefox first. Based on public information as of October 2026. Corrections are welcome via an [issue](https://github.com/3333444n/sitecatch/issues).

## Install (from source)

Requirements: Node 24 and pnpm 10.

```sh
git clone https://github.com/3333444n/sitecatch.git
cd sitecatch
pnpm install
pnpm build:firefox
```

**Firefox, for daily use (signed `.xpi`):** Firefox only keeps signed add-ons installed. Release builds are signed on AMO's unlisted channel (self-distributed, not listed in the store). Install the `.xpi` via `about:addons` → gear icon → **Install Add-on From File…**. It stays installed across restarts and updates in place when you install a newer version. Maintainers create it with `pnpm sign:firefox` ([releasing guide](docs/releasing.md)).

**Firefox, for development (temporary add-on):** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3/manifest.json`. Temporary add-ons are removed when Firefox restarts. `pnpm dev:firefox` builds, launches a Firefox window with Sitecatch loaded, and reloads on changes.

**Chrome** (not smoke-tested yet): `pnpm build:chrome`, then `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `.output/chrome-mv3`.

Requires Firefox 140+ (desktop) or a current Chrome.

## Quick setup

The setup wizard opens after install. It offers two ways to connect:

1. **Personal access token (recommended).** In Notion's Developer portal → **Personal access tokens** → **New token** (name it `Sitecatch`) → copy it (it's shown only once). It acts as you, so every database you can open just works.
2. **Internal connection.** For a narrower token: a Workspace Owner creates an internal connection with Read, Update and Insert content, copies its API token, then shares each database with it (database **•••** → **Connections** → **+ Add connection** → Sitecatch).

Then allow access to api.notion.com when asked, paste the token, create a preset for a database, and save your first page.

Full walkthrough with troubleshooting: [docs/setup-guide.md](docs/setup-guide.md).

## Permissions & privacy

| Permission | Why |
| --- | --- |
| `activeTab` | Read and screenshot the current tab, only after you click the button |
| `scripting` | Collect title, metadata, selection and fonts from that tab (read-only) |
| `storage` | Your token and settings (this device), presets (synced) |
| `https://api.notion.com/*` | The only server Sitecatch talks to |

**Privacy:** your browser talks to api.notion.com and nothing else. No account, analytics, telemetry or remote code. The token stays on this device (`storage.local`) and is never synced, exported or logged. Page data (URL, title, descriptions, screenshot…) is sent only when you save, plus the page URL for the duplicate check when the popup opens. Firefox shows this as the required "browsing activity" and "website content" data collection. Details: [docs/permissions-privacy.md](docs/permissions-privacy.md).

## Development

| Command | |
| --- | --- |
| `pnpm dev:firefox` / `pnpm dev` | Dev build with live reload (Firefox / Chrome) |
| `pnpm build:firefox` / `pnpm build:chrome` | Production build |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` / `pnpm lint` / `pnpm lint:ext` | Types, ESLint, web-ext lint |
| `pnpm check` | All of the above. Must pass before opening a PR. |
| `pnpm zip:firefox` / `pnpm zip:chrome` | Store-ready zips in `.output/` |
| `pnpm sign:firefox` | Build and sign the Firefox `.xpi` on AMO (unlisted). See [docs/releasing.md](docs/releasing.md). |

Docs: [`/docs`](docs/README.md) · Design: [DESIGN.md](DESIGN.md) · Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Changes: [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE) © Sitecatch contributors

---

Notion is a trademark of Notion Labs, Inc. Sitecatch is not affiliated with or endorsed by Notion.
