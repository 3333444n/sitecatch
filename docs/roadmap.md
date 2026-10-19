# Roadmap

## v0.1.0 (released 2026-10-18)

Code: <https://github.com/3333444n/sitecatch>. Install from source or as a signed `.xpi` (AMO unlisted, self-distributed); store listings are out of scope for now.

- Firefox-first MV3 extension, plus a Chrome build (not yet smoke-tested).
- Guided setup wizard: **personal access token** (default, no per-database sharing) or **internal connection** token, api.notion.com access, sharing databases (connections only), database list with "Can't see your database?" help.
- Presets: target data source, per-property sources (extractor with fallbacks / ask in popup / static), screenshot → files property / cover / body image, cover from og:image, favicon icon, duplicate detection by normalized URL.
- Extractors: screenshot, title, ogTitle, url, canonicalUrl, domain, metaDescription, ogDescription, favicon, ogImage, selection, fonts, dateSaved.
- Popup: editable pre-filled form, duplicate banner (update / duplicate / open), background save that survives popup close, success with **Open in Notion**, actionable errors, restricted-page fallback.
- Presets synced via `storage.sync`. JSON import/export.
- Signed on AMO's **unlisted** channel (self-distributed `.xpi`, 2026-10-18). The gecko id `sitecatch@sitecatch.app` is final and permanent. Process: [releasing.md](./releasing.md).
- Manually tested end to end in Firefox with a personal access token on a Free-plan workspace (2026-10-18). Verified and still-open items: [testing.md](./testing.md#manual-e2e-results).

## Next

- Finish the manual E2E: Chrome smoke test, internal connection path, restricted pages, popup closed mid-save, import/export, the old `notion.so/profile/integrations` redirect.
- Capture the setup screenshots setup-1…13 into `public/setup/` ([checklist](./setup-guide.md#screenshots-to-capture)). Until then the wizard shows "Screenshot coming soon".

### Known issues

- Popup: the favicon badge overlaps the top-left corner of the screenshot thumbnail.

## Later

Not committed, roughly in priority order:

- **Public AMO listing and Chrome Web Store listing** (Firefox builds are already signed unlisted; a listing needs store assets and a privacy policy from [permissions-privacy.md](./permissions-privacy.md)).
- **Upload favicons** instead of hotlinking them (some hosts block hotlinking).
- **Published date / author auto-mapping** (`article:published_time`, JSON-LD, `author` meta).
- **Image picker for the cover** (choose among og:image, page images, screenshot).
- **Per-preset keyboard shortcuts / instant save** (save with the preset's defaults, no form).
- **Highlights**: save selected passages to the page body.
- **Tech detection** extractor ("Built with": frameworks, CMS, analytics). See [extractors.md](./extractors.md#later-tech-detection-v2).
- **AI summaries** (bring-your-own key, opt-in, clearly disclosed data flow).
- **OAuth public connection**, for one-click authorization instead of a pasted token. Needs a small token-exchange backend or a PKCE-capable flow, so it is a separate decision ([ADR 0003](./decisions/0003-internal-token-no-backend.md)).
- **Other destinations** beyond Notion.
