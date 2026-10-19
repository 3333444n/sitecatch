# Design

Sitecatch is an MV3 extension (WXT, TypeScript, Preact) with no backend. Its three parts are the popup, the options page and the background.

- **Popup.** Picks a preset, shows a pre-filled editable form for the current tab, and handles duplicates.
- **Options page.** Holds the setup wizard, the preset editor, settings and import/export.
- **Background.** Owns the token and makes every call to `api.notion.com`: capture (`scripting.executeScript` + `captureVisibleTab`), schema reads, duplicate checks and the save pipeline.

UI pages talk to the background only through a typed request/response protocol (`src/lib/messaging/protocol.ts`), and every response is a `Result<T>`.

A **preset** is a target Notion data source plus a list of mappings, keyed by property **id**. Each mapping takes its value from an **extractor** (with fallbacks), is **asked** in the popup, or is **static**. The preset also says where the screenshot goes (`screenshot.filesPropertyId`, cover, body image), what the cover and icon are, and which property drives duplicate detection (it receives the normalized URL; if that property disappears, duplicate checking just turns off). Presets sync via `storage.sync`, one item each. The token stays in `storage.local`.

A **save** runs entirely in the background, so it survives the popup closing. The steps are: re-validate the schema → upload the screenshot once (sized to the workspace's upload limit) → build properties → create (or update) the page → report "Open in Notion" plus any warnings. Page creation is never retried blindly; a `committed_resource_id` in Notion's error or a follow-up duplicate query recovers a page that was saved after all.

Authentication is a pasted token: a **personal access token** (default; acts as you) or an **internal connection** token (sees only databases shared with it). See [ADR 0009](docs/decisions/0009-personal-access-token-default.md).

Read more:

- [Architecture](docs/architecture.md): components, message protocol, flows, storage, cross-browser notes
- [Preset model](docs/preset-model.md): types, compatibility matrix, validation, examples
- [UI flows](docs/ui-flows.md)
- [Notion API](docs/notion-api.md)
- [Decisions (ADRs)](docs/decisions/README.md)
