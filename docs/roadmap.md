# Roadmap

## v0 (current)

- Firefox-first MV3 extension (Chrome build also works). Load from source.
- Guided setup wizard: internal connection token, api.notion.com access, sharing databases, database list with "Can't see your database?" help.
- Presets: target data source, per-property sources (extractor with fallbacks / ask in popup / static), screenshot → files property / cover / body image, cover from og:image, favicon icon, duplicate detection by normalized URL.
- Extractors: screenshot, title, ogTitle, url, canonicalUrl, domain, metaDescription, ogDescription, favicon, ogImage, selection, fonts, dateSaved.
- Popup: editable pre-filled form, duplicate banner (update / duplicate / open), background save that survives popup close, success with **Open in Notion**, actionable errors, restricted-page fallback.
- Presets synced via `storage.sync`. JSON import/export.
- Open items to verify during v0: `activeTab` + `captureVisibleTab` in the Firefox MV3 popup (fallback: optional `<all_urls>` at capture time). Final gecko id before the first signed build (it can't change after AMO publication).

## Later

Not committed, roughly in priority order:

- **AMO and Chrome Web Store listings** (signed builds, privacy policy from [permissions-privacy.md](./permissions-privacy.md)).
- **Upload favicons** instead of hotlinking them (some hosts block hotlinking).
- **Published date / author auto-mapping** (`article:published_time`, JSON-LD, `author` meta).
- **Image picker for the cover** (choose among og:image, page images, screenshot).
- **Per-preset keyboard shortcuts / instant save** (save with the preset's defaults, no form).
- **Highlights**: save selected passages to the page body.
- **Tech detection** extractor ("Built with": frameworks, CMS, analytics). See [extractors.md](./extractors.md#later-tech-detection-v2).
- **AI summaries** (bring-your-own key, opt-in, clearly disclosed data flow).
- **Personal access token** support documented/tested (acts as the user, no per-database sharing).
- **OAuth public connection**, for one-click authorization instead of a pasted token. Needs a small token-exchange backend or a PKCE-capable flow, so it is a separate decision ([ADR 0003](./decisions/0003-internal-token-no-backend.md)).
- **Other destinations** beyond Notion.
