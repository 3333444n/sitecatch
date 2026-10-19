# Changelog

All notable changes to Sitecatch are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/sitecatch/sitecatch/releases/tag/v0.1.0
