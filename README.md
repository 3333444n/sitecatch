# Sitecatch

**Collect websites into your Notion databases.**

Sitecatch is an open-source browser extension, built for Firefox first, that saves the page you're on into the Notion database you choose. It captures the screenshot, title, description, URL, fonts and more, and you decide which property gets what. It uses the official Notion API with your own token. There is no account, no backend and no tracking.

<!-- SCREENSHOT: hero — add a popup GIF at docs/images/hero.gif and uncomment:
![Sitecatch popup saving a page to Notion](docs/images/hero.gif)
-->

> **Status:** early development (v0). Store listings are coming. For now, install from source.

## Features

- **Presets per database.** Example: "Resources" fills Name, URL, Description, Type and Tags, and "Fav websites" fills Domain, Fonts and Rating. You can have as many presets as you like.
- **Per-property value sources**: extracted from the page (with fallbacks, e.g. Open Graph title → page title), **asked in the popup**, or a **fixed value**.
- **Screenshots**: into a files property, as the page cover, and/or as an image in the page body. Uploaded to Notion, no third-party hosting.
- **Cover & icon** from the page's Open Graph image and favicon.
- **Duplicate detection** by normalized URL: update the existing page, save a duplicate, or open the existing one.
- **Editable form** before saving. The save keeps going in the background if you close the popup. When it's done you get **Open in Notion**.
- **Guided setup wizard** with exact steps and troubleshooting.
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

"—" means not verified. All of these are useful tools, and each has strengths. Sitecatch's angle is open source, the official API, minimal permissions and Firefox first. Based on public information as of October 2026. Corrections are welcome via an issue.

## Install (from source)

Requirements: Node 24, pnpm 10.

```sh
pnpm i
pnpm build:firefox
```

Then in Firefox open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3/manifest.json`. For Chrome, run `pnpm build:chrome` and load `.output/chrome-mv3` unpacked from `chrome://extensions` (Developer mode).

Listings on addons.mozilla.org and the Chrome Web Store are coming.

## Quick setup

1. Create an internal connection named **Sitecatch** in Notion's Developer portal (Read, Update, Insert content).
2. Copy its API token and paste it into the Sitecatch setup wizard.
3. In Notion, open each database → **•••** → **Connections** → **Add connection** → Sitecatch.
4. Create a preset and save your first page.

Full walkthrough: [docs/setup-guide.md](docs/setup-guide.md).

## Permissions & privacy

| Permission | Why |
| --- | --- |
| `activeTab` | Read and screenshot the current tab, only after you click the button |
| `scripting` | Collect title, metadata, selection and fonts from that tab (read-only) |
| `storage` | Your token and settings (this device), presets (synced) |
| `https://api.notion.com/*` | The only server Sitecatch talks to |

**Privacy:** your browser talks to api.notion.com and nothing else. The token stays on your device and is never synced or logged. Details: [docs/permissions-privacy.md](docs/permissions-privacy.md).

## Development

| Command | |
| --- | --- |
| `pnpm dev:firefox` / `pnpm dev` | Dev build with live reload (Firefox / Chrome) |
| `pnpm build:firefox` / `pnpm build:chrome` | Production build |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` / `pnpm lint` / `pnpm lint:ext` | Types, ESLint, web-ext lint |
| `pnpm check` | All of the above. Must pass before merging. |

Docs: [`/docs`](docs/README.md) · Design: [DESIGN.md](DESIGN.md) · Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)

---

Notion is a trademark of Notion Labs, Inc. Sitecatch is not affiliated with or endorsed by Notion.
