# Changelog

All notable changes to Sitecatch are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Multiple workspace connections.** Connect several Notion workspaces, each with its own token (`local:connections`, one connection per workspace, keyed by the workspace id when Notion reports it). Each preset owns its workspace (`Preset.connectionId`); there is no global workspace switcher. The popup groups presets by workspace when more than one is connected, and Options → Workspaces lists connections, removes them, and assigns presets that need a workspace. Decision: [ADR 0010](docs/decisions/0010-multiple-workspace-connections.md).
- **Relation properties.** `relation` properties can be filled with a fixed set of pages or asked in the popup, using a searchable page picker over the relation's target database (new `pages/search` message, at most 25 results). Ids are deduplicated and capped at 100 per property, with a warning. Details: [docs/preset-model.md](docs/preset-model.md#relations).
- `pnpm sign:firefox`: builds and signs the Firefox `.xpi` on AMO's unlisted channel. It reads the AMO keys from the environment or `.env.local` (template: `.env.example`), never prints them, and supports `--dry-run`. Guide: [docs/releasing.md](docs/releasing.md).

### Changed

- Presets move to schema version 2 (`connectionId`, `workspaceName`). v1 presets, including imported JSON, migrate automatically with `connectionId: null` and use the only connection while there is exactly one; adding a second workspace pins them to the first.
- The v0.1 token in `local:auth` is copied once into `local:connections` on upgrade. The original is kept so a downgrade still works, and is cleared when that workspace is removed.
- Message protocol: `auth/validate`, `auth/status` and `auth/clear` became `conn/add`, `conn/list` and `conn/remove`. `ds/list` and `ds/schema` take a `connectionId`; `dup/check` and `save/start` use the preset's connection.
- **Mixed versions:** a preset saved by this version (schema v2) is rejected by v0.1 on another synced device with "made with a newer version of Sitecatch — update the extension". Nothing is deleted; update every device. v1 presets stay v1 in sync until they are edited or a second workspace is added.
- The Firefox add-on id `sitecatch@sitecatch.app` is final. v0.1.0 was signed under it on AMO's unlisted channel (2026-10-18).

## [0.1.0] - 2026-10-18

First release (install from source; store listings to follow).

### Added

- Firefox-first Manifest V3 extension (WXT, TypeScript, Preact) with a Chrome build. No backend: the extension talks only to `api.notion.com`.
- Setup wizard: **personal access token** (recommended) or **internal connection**, api.notion.com access, sharing databases (connections only), "Your databases" list with "Can't see your database?" help.
- Presets per Notion data source: each property gets its value from the page (extractor with fallbacks), is asked in the popup, or is fixed. Screenshot into a files property, as the cover and/or in the page body; og:image cover; favicon icon.
- 13 extractors: screenshot, title, Open Graph title, URL, canonical URL, domain, meta description, Open Graph description, favicon, og:image, selection, fonts, date saved.
- Popup: pre-filled editable form, duplicate detection by normalized URL (update existing / save as duplicate / open existing), background save that survives closing the popup, "Open in Notion", save warnings, actionable errors, restricted-page fallback.
- Screenshot sized to the workspace's upload limit and uploaded once per save.
- Safe page creation: no blind retries; recovery via `committed_resource_id` or a follow-up duplicate query.
- Presets sync through the browser (`storage.sync`); JSON import/export (never includes the token).
- Settings: capture delay, JPEG quality, Notion account, recent saves.
- Sitecatch icon.

[Unreleased]: https://github.com/3333444n/sitecatch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/3333444n/sitecatch/releases/tag/v0.1.0
