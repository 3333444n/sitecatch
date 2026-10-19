# Preset model

A **preset** describes how one kind of save works: which Notion data source to write to, where each property gets its value, and where the screenshot goes. Users define as many presets as they like, for example "Resources" or "Fav websites". Source of truth for the types: `src/lib/presets/types.ts`.

## Types

### `Preset`

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Shape version for storage and export. Bump with a migration when the shape changes. |
| `id` | `string` | `crypto.randomUUID()`. |
| `name` | `string` | Shown in the popup picker. |
| `dataSourceId` | `string` | Target Notion **data source** ([notion-api.md](./notion-api.md#data-sources-model)). |
| `dataSourceName` | `string` | Snapshot of the name, used for display before the schema loads or when offline. |
| `mappings` | `Mapping[]` | One per property that Sitecatch writes. **Unmapped properties are never shown or written.** |
| `screenshot.filesPropertyId` | `string \| null` | `files` property that receives the screenshot, or `null`. |
| `screenshot.bodyImage` | `boolean` | Also add the screenshot as an image block in the page body. Applies to new pages only, never to updates. |
| `cover` | `'none' \| 'screenshot' \| 'ogImage'` | Page cover: none, the uploaded screenshot, or the page's `og:image` as an external URL. |
| `icon` | `'none' \| 'favicon'` | Page icon: none, or the site favicon as an external URL. |
| `dedupe.propertyId` | `string \| null` | `url` (or text) property compared against the normalized page URL. `null` turns duplicate detection off. |
| `updatedAt` | ISO 8601 | Last edit. |

The screenshot is uploaded **at most once per save** and reused for the files property, the cover and the body image ([ADR 0007](./decisions/0007-screenshot-jpeg-file-upload.md)).

### `Mapping`

| Field | Meaning |
| --- | --- |
| `propertyId` | Notion property **id**. Ids survive renames ([ADR 0006](./decisions/0006-map-properties-by-id.md)). |
| `propertyName` | Name snapshot taken when the mapping was saved. Used to show and detect renames. |
| `propertyType` | Type snapshot (`WritablePropertyType`). Used to detect type changes. |
| `source` | `ValueSource` (below). |
| `editableInPopup` | Show the field in the popup form so the value can be tweaked before saving. |

Writable property types (v0): `title`, `rich_text`, `number`, `select`, `multi_select`, `status`, `date`, `files`, `checkbox`, `url`, `email`, `phone_number`. All other types (relation, people, formula, rollup, created/edited time/by, unique_id, verification, button, unknown) are read-only to Sitecatch and can't be mapped.

### Value sources

| `source.kind` | Fields | Behavior |
| --- | --- | --- |
| `extractor` | `extractor: ExtractorId`, `fallbacks?: ExtractorId[]` | Value comes from the page. If the primary extractor returns nothing, the fallbacks are tried in order (e.g. `ogTitle` → `title`). Extractor and property type must be compatible (see the matrix below). |
| `ask` | `default?: FormValue`, `required?: boolean` | Always shown in the popup as an input matching the property type, pre-filled with `default`. `required` blocks Save until the field is filled. |
| `static` | `value: StaticValue` | A fixed value set in the preset editor (e.g. Status = "To read"). |

`extractor` and `static` mappings appear in the popup only when `editableInPopup` is true. `ask` mappings always appear.

### Form values

The popup form state is `FormValues`: a record keyed by property id. Each entry is a `FormValue` tagged by input kind:

| Property type | `FormValue.kind` | Value |
| --- | --- | --- |
| `title`, `rich_text`, `url`, `email`, `phone_number` | `text` | `string` |
| `number` | `number` | `number \| null` |
| `checkbox` | `checkbox` | `boolean` |
| `select`, `status` | `select` | option **name** or `null` |
| `multi_select` | `multi_select` | option names |
| `date` | `date` | `{ start, end? } \| null` |
| `files` | `files` | `FileRef[]`: `{kind:'screenshot'}` or `{kind:'external', url, name?}` |

`StaticValue` and `ask.default` use the same shape.

## Compatibility matrix

Each extractor declares an output `ValueKind`. A mapping from an extractor is allowed only if the property type is listed for that kind. The preset editor offers only compatible extractors (`src/lib/presets/compat.ts`, with `ExtractorDef.compatible` per extractor).

| Output kind | Extractors | Allowed property types |
| --- | --- | --- |
| `text` | `title`, `ogTitle`, `domain`, `metaDescription`, `ogDescription`, `selection` | `title`, `rich_text`, `select`, `multi_select` |
| `url` | `url`, `canonicalUrl` | `url`, `rich_text`, `title` |
| `list` | `fonts` | `multi_select`, `rich_text` (joined with `, `) |
| `date` | `dateSaved` | `date` |
| `image` | `screenshot`, `favicon`, `ogImage` | `files` |

`number`, `checkbox`, `status`, `email` and `phone_number` have no compatible extractor in v0. They can be filled from `ask` or `static` only.

Conversions:

- Text → `select` uses the text as the option name, with commas replaced. Text → `multi_select` produces a single option.
- List → `rich_text` joins the items with `, `.
- Image → `files`: `screenshot` becomes the uploaded file. `favicon` and `ogImage` become external files.

## Validation

Every time the popup opens (`ds/schema`) and again right before saving (save pipeline), the preset is validated against the **live** data source schema. Problems are reported as `PresetIssue { propertyId, kind, blocking, detail }`. `blocking` (set by `validatePreset`, read via `isBlocking()`) says whether the issue must be fixed before saving; the table below gives the defaults.

| `kind` | When | Blocks saving? |
| --- | --- | --- |
| `missing` | The mapped property was deleted or isn't visible to the connection anymore. | **Yes** → `preset-invalid`, action `edit-preset`. |
| `renamed` | Same id, different name than `propertyName`. | No. The mapping keeps working. Informational notice, and the editor updates the snapshot on next save. |
| `type-changed` | The property's type differs from `propertyType`. | **Yes**, until the mapping is fixed. |
| `option-missing` | A `static` value or `ask.default` refers to a select / multi-select / status option that no longer exists. | `select`/`multi_select`: **no**, Notion creates the option on save (warning shown). `status`: **yes**, because the API can't create status options. |

The same checks cover the non-mapping references:

- `screenshot.filesPropertyId` that is missing or no longer `files`: **blocks** (same as `missing` / `type-changed`).
- `dedupe.propertyId` that is missing or no longer `url` / `rich_text` / `title`: **doesn't block** (`blocking: false`, detail starts with "Duplicate check is off: …"). The popup shows it as a notice, `dup/check` returns no matches without querying Notion, and the save pipeline skips dedupe entirely (the URL value is written as-is, not normalized).

Blocking issues show in the popup with an "Edit preset" button. The preset editor highlights the affected mappings.

## Storage and sync

Presets live in `storage.sync`, so they follow the user across browsers signed into the same Firefox account / Chrome profile ([ADR 0005](./decisions/0005-presets-in-storage-sync.md)):

- `sync:presetIndex`: ordered list of preset ids.
- `sync:preset:<id>`: one item **per preset**.

Quotas (Chrome and Firefox, [MDN storage.sync](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync)): about **100 KB total**, **8 KB per item**, **512 items**. Chrome also limits writes (120/minute, 1800/hour). One preset per item keeps each preset well under 8 KB and avoids rewriting all presets on every edit. A preset that would exceed 8 KB (very many mappings) is rejected by the editor with a clear message.

In Firefox, `storage.sync` only syncs when the user is signed in to a Mozilla account with add-on sync enabled. Otherwise it behaves like local storage. The **token is never stored in sync** ([permissions-privacy.md](./permissions-privacy.md#token-storage)).

## Import / export

Options → Import/Export reads and writes a JSON file in this envelope (`PresetExportFile`):

```json
{
  "format": "sitecatch-presets",
  "version": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "presets": [ /* Preset objects */ ]
}
```

- Export contains presets only. **Never the token**, settings or history.
- Import checks `format === "sitecatch-presets"` and a supported `version`, then validates each preset's shape and `schemaVersion`. Invalid files are rejected with a message. Nothing is partially imported.
- Imported presets may point to data sources the current token can't see (e.g. another workspace). They import fine and show `missing` / `db-not-shared` issues until fixed.
- Ids: an imported preset whose `id` already exists asks the user to **replace** it or **keep both**. Keep both gives the imported preset a new id.

## Examples

Two databases from the [E2E checklist](./testing.md#manual-e2e-checklist). Property ids look like real Notion ids (the title property's id is always `title`).

**Resources**: Name (title), URL (url), Description (text), Type (select), Tags (multi-select), Status (status), Saved (date), Screenshot (files).

```json
{
  "schemaVersion": 1,
  "id": "6f1c2a7e-3b0d-4d8e-9a51-1c2f3e4d5a6b",
  "name": "Resources",
  "dataSourceId": "2a3b4c5d-6e7f-4081-92a3-b4c5d6e7f809",
  "dataSourceName": "Resources",
  "mappings": [
    {
      "propertyId": "title",
      "propertyName": "Name",
      "propertyType": "title",
      "source": { "kind": "extractor", "extractor": "ogTitle", "fallbacks": ["title"] },
      "editableInPopup": true
    },
    {
      "propertyId": "%3DUrl",
      "propertyName": "URL",
      "propertyType": "url",
      "source": { "kind": "extractor", "extractor": "canonicalUrl", "fallbacks": ["url"] },
      "editableInPopup": false
    },
    {
      "propertyId": "Dsc%7C",
      "propertyName": "Description",
      "propertyType": "rich_text",
      "source": { "kind": "extractor", "extractor": "ogDescription", "fallbacks": ["metaDescription"] },
      "editableInPopup": true
    },
    {
      "propertyId": "Typ%40",
      "propertyName": "Type",
      "propertyType": "select",
      "source": { "kind": "ask", "default": { "kind": "select", "value": "Article" }, "required": true },
      "editableInPopup": true
    },
    {
      "propertyId": "Tg%3Bs",
      "propertyName": "Tags",
      "propertyType": "multi_select",
      "source": { "kind": "ask" },
      "editableInPopup": true
    },
    {
      "propertyId": "St%5Ea",
      "propertyName": "Status",
      "propertyType": "status",
      "source": { "kind": "static", "value": { "kind": "select", "value": "To read" } },
      "editableInPopup": false
    },
    {
      "propertyId": "Sv%3Dd",
      "propertyName": "Saved",
      "propertyType": "date",
      "source": { "kind": "extractor", "extractor": "dateSaved" },
      "editableInPopup": false
    }
  ],
  "screenshot": { "filesPropertyId": "Sc%3Fr", "bodyImage": false },
  "cover": "ogImage",
  "icon": "favicon",
  "dedupe": { "propertyId": "%3DUrl" },
  "updatedAt": "2026-10-18T12:00:00.000Z"
}
```

**Fav websites**: Name (title), URL (url), Domain (text), Fonts (multi-select), Rating (select), Notes (text). The screenshot goes to the cover and the page body.

```json
{
  "schemaVersion": 1,
  "id": "b7e8f9a0-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
  "name": "Fav websites",
  "dataSourceId": "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
  "dataSourceName": "Fav websites",
  "mappings": [
    {
      "propertyId": "title",
      "propertyName": "Name",
      "propertyType": "title",
      "source": { "kind": "extractor", "extractor": "title" },
      "editableInPopup": true
    },
    {
      "propertyId": "u%5Brl",
      "propertyName": "URL",
      "propertyType": "url",
      "source": { "kind": "extractor", "extractor": "url" },
      "editableInPopup": false
    },
    {
      "propertyId": "Dm%3Fn",
      "propertyName": "Domain",
      "propertyType": "rich_text",
      "source": { "kind": "extractor", "extractor": "domain" },
      "editableInPopup": false
    },
    {
      "propertyId": "Fn%7Dt",
      "propertyName": "Fonts",
      "propertyType": "multi_select",
      "source": { "kind": "extractor", "extractor": "fonts" },
      "editableInPopup": true
    },
    {
      "propertyId": "Rt%3Cg",
      "propertyName": "Rating",
      "propertyType": "select",
      "source": { "kind": "ask", "default": { "kind": "select", "value": "★★★" } },
      "editableInPopup": true
    },
    {
      "propertyId": "Nt%3Es",
      "propertyName": "Notes",
      "propertyType": "rich_text",
      "source": { "kind": "ask" },
      "editableInPopup": true
    }
  ],
  "screenshot": { "filesPropertyId": null, "bodyImage": true },
  "cover": "screenshot",
  "icon": "favicon",
  "dedupe": { "propertyId": "u%5Brl" },
  "updatedAt": "2026-10-18T12:00:00.000Z"
}
```

## Open questions

- **Screenshot into a `files` property has two spellings.** `screenshot.filesPropertyId` and a `files` mapping with `extractor: "screenshot"` both express the same thing. Until this is settled, the preset editor uses `screenshot.filesPropertyId` and offers the `screenshot` extractor only in a `files` mapping that differs from it. Both resolve to the same single upload.
