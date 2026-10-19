# Extractors

An **extractor** turns what was captured from the tab into one value that can go into a Notion property. Types: `src/lib/extract/types.ts`. Implementations: `src/lib/extract/`.

## Pipeline

1. **Probe.** `capture/run` injects a function with `scripting.executeScript` into the active tab. It returns `RawPageData`, which contains only plain serializable data: `title`, `url`, `meta` (keyed by lowercased `name`/`property`, first occurrence wins), `links` (`rel` + absolute `href`), `selection`, `fonts` (body/h1/h2 computed font family), `readyState`.
2. **Screenshot.** The capture module calls `tabs.captureVisibleTab` separately and passes the result as `ctx.screenshot`.
3. **Extract.** Each registered `ExtractorDef.extract(raw, ctx)` is a **pure function** that returns an `ExtractedValue`, or `null` when the page has no such value. `ctx.now` is injected for deterministic tests. Extractors with `needsPage: false` (`screenshot`, `dateSaved`) read only `ctx`, so they still run when the page couldn't be probed; all others are skipped in that case. An extractor that throws is skipped and reported as a capture warning.
4. Results are bundled into `CaptureResult.values` (keyed by `ExtractorId`) and sent to the popup. The popup applies each mapping's primary extractor and `fallbacks` ([preset-model.md](./preset-model.md#value-sources)).

On **restricted pages** (about:, browser stores, PDF viewer, reader mode…) no probe runs. Only `url`, `title` (from the tab) and `dateSaved` are available, `restricted` is `true` and a `restrictedReason` is shown ([ui-flows.md](./ui-flows.md#restricted-page)). If the probe fails on an ordinary page but the screenshot works, the result is not restricted: the URL/title fallbacks, `dateSaved` and `screenshot` are filled.

## Extractors (v0)

| Id | Output | Source (in order) | Notes |
| --- | --- | --- | --- |
| `screenshot` | `image` (`dataUrl`) | `tabs.captureVisibleTab` of the visible viewport | `needsPage: false`. JPEG at `settings.jpegQuality` (default 0.85). Downscaled/re-encoded to < 4.5 MiB to stay under Notion's 5 MiB Free-plan file limit (the save pipeline recompresses again to the workspace's `maxFileUploadBytes` if needed). Adds a warning if downscaled. Captured after `readyState === 'complete'` plus `settings.captureDelayMs`. Never offered as a mapping source in the preset editor: the screenshot goes to `preset.screenshot.filesPropertyId`, the cover or the body image ([preset-model.md](./preset-model.md#screenshot-into-a-files-property)). |
| `title` | `text` | `document.title` | Trimmed. `null` if empty. |
| `ogTitle` | `text` | `meta['og:title']` → `meta['twitter:title']` | Typical mapping: `ogTitle` with fallback `title`. |
| `url` | `url` | `location.href` | The URL as shown in the tab. |
| `canonicalUrl` | `url` | `<link rel="canonical">` href | Absolute. `null` if absent. Typical fallback: `url`. |
| `domain` | `text` | hostname of `url` | Leading `www.` removed (e.g. `example.com`). |
| `metaDescription` | `text` | `meta['description']` | |
| `ogDescription` | `text` | `meta['og:description']` → `meta['twitter:description']` | Typical fallback: `metaDescription`. |
| `favicon` | `image` (`url`) | `<link rel="icon">` → `rel="shortcut icon"` → `rel="apple-touch-icon"` → `<origin>/favicon.ico` | Used as an external URL (page icon or `files`). Some hosts block hotlinking. Uploading favicons is planned ([roadmap.md](./roadmap.md)). |
| `ogImage` | `image` (`url`) | `meta['og:image']` → `meta['twitter:image']` | Resolved to absolute. Used for `cover: "ogImage"` or a `files` property (external). |
| `selection` | `text` | `window.getSelection()` text | `null` when nothing is selected. Good for a "Quote" / "Notes" property. |
| `fonts` | `list` | Computed `font-family` of body, first `h1`, first `h2` | First family of each stack, quotes stripped, de-duplicated (e.g. `["Inter", "Playfair Display"]`). Maps naturally to `multi_select`. |
| `dateSaved` | `date` | `ctx.now` (`CaptureResult.capturedAt`) | `needsPage: false`. Date and time of capture as ISO 8601 UTC (`…Z`). Available on restricted pages too. Edited date-times without an offset get the local UTC offset when saved ([preset-model.md](./preset-model.md#compatibility-matrix)). |

Allowed property types per output kind come from one table, `VALUE_KIND_TARGETS` in `src/lib/extract/compat-table.ts`, documented in the [compatibility matrix](./preset-model.md#compatibility-matrix).

## Adding an extractor

1. **Id.** Add the new id to the `ExtractorId` union in `src/lib/extract/types.ts`. This is a **contract file**: ask the orchestrator.
2. **Raw data.** If the probe doesn't collect what you need yet, extend `RawPageData` (also a contract change) and the probe in `src/lib/extract/probe.ts` (called from `src/lib/capture/capture.ts`). Keep it serializable and cheap. The probe runs on every capture.
3. **Implement** an `ExtractorDef` in `src/lib/extract/extractors/<id>.ts`:
   ```ts
   export const myExtractor = defineExtractor({
     id: 'myId',
     label: 'Short UI label',
     description: 'One line shown in the preset editor.',
     output: 'text',
     // `compatible` defaults to VALUE_KIND_TARGETS[output] (compat-table.ts) via defineExtractor().
     // needsPage: false, // only if it reads nothing but `ctx`
     extract(raw, ctx) {
       const value = raw.meta['some:tag']?.trim();
       return value ? { kind: 'text', value } : null;
     },
   });
   ```
   `extract` must be **pure**: no DOM, no `browser.*`, no network. Return `null` instead of empty strings.
4. **Register** it in the registry (`src/lib/extract/registry.ts`). The preset editor and capture pick it up from there.
5. **Test** it with `RawPageData` fixtures (and happy-dom HTML fixtures for probe changes) in `*.test.ts` next to the code.
6. **Document** it in the table above and, if the output kind is new, add it to `compat-table.ts` (contract file) and the compatibility matrix.

## Later: tech detection (v2)

A planned `tech` extractor (output `list`) would detect frameworks, CMSs and analytics on a page (e.g. "Next.js", "WordPress", "Webflow") for a "Built with" multi-select. It needs extra probe data (script srcs, generator meta, known globals) and a signature list. It is **not in v0**. See [roadmap.md](./roadmap.md).
