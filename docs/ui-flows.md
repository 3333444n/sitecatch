# UI flows

Two UI surfaces: the **popup** (toolbar button) and the **options page** (setup wizard, presets, settings). Both are Preact apps that talk to the background only through `sendRequest()` ([architecture.md](./architecture.md#message-protocol)). Styling uses the tokens in `src/ui/theme.css` (light/dark).

## Popup

```mermaid
stateDiagram-v2
  [*] --> Checking: open (auth/status)
  Checking --> NoSetup: no token / no host permission
  Checking --> NoPresets: token ok, 0 presets
  Checking --> Capturing: token ok, preset selected
  Capturing --> Restricted: capture.restricted
  Capturing --> Form: capture + schema + dup check done
  Restricted --> Form: url/title fallback
  Form --> Duplicate: dup/check found matches
  Duplicate --> Saving: Update existing / Save as duplicate
  Duplicate --> [*]: Open existing (new tab)
  Form --> Saving: Save (save/start)
  Saving --> Success: job done
  Saving --> Error: job error
  Error --> Saving: Retry
  Success --> [*]
```

### No setup

Shown when `auth/status` reports `hasToken: false` or `hostPermission: false`. Message ("Connect Sitecatch to Notion to start saving") plus an **Open setup** button that opens the options wizard. If only the host permission is missing, a **Grant access** button calls `browser.permissions.request` from the click handler. There are no other controls.

If there are no presets yet: "Create your first preset" → opens Options → Presets.

### Capturing

- **Preset picker** at the top, preselected with `local:lastPresetId`. Changing the preset re-runs schema validation and the duplicate check. The capture is reused.
- Three requests run in parallel: `capture/run`, `ds/schema`, `dup/check`. Placeholder/skeleton rows are shown, with a short "Capturing…" label.
- Capture waits for `readyState === 'complete'` plus the optional delay from Settings.

### Form

- Thumbnail of the screenshot, if the preset uses one, plus the page title/domain.
- One field per **visible mapping**: every `ask` mapping, plus `extractor`/`static` mappings with `editableInPopup`. The input matches the property type (Text, Url, Number, Checkbox, Date, Select, MultiSelect with "create option", Status).
- Pre-filled from extractors (primary → fallbacks), `ask.default`, or the static value.
- `required` ask fields block **Save** until filled.
- Capture warnings (e.g. "Screenshot was downscaled") appear as small notes.
- **Preset issues** ([preset-model.md](./preset-model.md#validation)): blocking issues disable Save and show **Edit preset**. Non-blocking ones (renamed, select option will be created, dedupe skipped) show as a dismissible notice.

### Duplicate banner

Shown above the form when `dup/check` returns matches: "Already saved in *Resources*: '<title>', edited <relative time>."

| Button | Effect |
| --- | --- |
| **Update existing** | `save/start` with `mode: {kind:'update', pageId}`. Replaces mapped properties, cover and icon. No new body image. |
| **Save as duplicate** | `save/start` with `mode: {kind:'duplicate'}`. Creates a new page. |
| **Open existing** | Opens the existing page's Notion URL in a new tab. Saves nothing. |

With several matches, the banner shows the most recently edited one and a count.

### Saving

`save/start` returns a `jobId`. The popup polls `job/get` and shows the step: *Uploading screenshot…* (`uploading`), then *Saving to Notion…* (`creating`). The user may close the popup. The save continues in the background and the toolbar badge shows ✓ (done) or ! (error).

### Success

"Saved to *Resources*" with an **Open in Notion** button (`JobState.pageUrl`, opens in a new tab). The entry is added to `local:history`. The popup can be closed. Reopening it on the same page shows the duplicate banner.

### Error

The `AppError.message` in plain language, with a button for `action`:

| `action` | Button |
| --- | --- |
| `open-setup` | Open setup |
| `reshare-db` | How to share the database (opens setup step 4) |
| `retry` | Try again (for a failed create, the duplicate check runs again first) |
| `edit-preset` | Edit preset |
| `grant-permission` | Grant access |

A collapsible **Details** section shows `AppError.detail` (HTTP status, Notion code). It never shows the token.

### Restricted page

For about:/chrome:// pages, add-on and web stores, the PDF viewer, reader mode, view-source, etc., the probe and screenshot can't run. The popup shows a notice with `restrictedReason` (e.g. "Firefox doesn't allow extensions on add-on store pages") and still offers the form with **URL, tab title and date saved** only. Mappings that depend on other extractors stay empty, and `ask` fields still work.

## Options page

Sections: **Setup**, **Presets**, **Settings**, **Import/Export**, **Help**. Opens automatically on install (`runtime.onInstalled`, reason `install`).

### Setup wizard

Five steps matching [setup-guide.md](./setup-guide.md). Each step has exact instructions and a screenshot slot (`ScreenshotSlot`, filled with real screenshots later):

1. **Create the connection**: link to the Notion Developer portal, the field values to use, and the capabilities to check.
2. **Copy the token**: where to find it on the Configuration tab.
3. **Connect**: **Grant access** (api.notion.com, `permissions.request` in the click handler) when missing. Token field, validated instantly with `auth/validate`, showing bot name + workspace or an actionable error.
4. **Share databases**: ••• → Connections → Add connection → Sitecatch → Confirm.
5. **Your databases**: `ds/list` result with search and **Refresh**. Empty state "Can't see your database?" lists the causes from the setup guide. Ends with **Create your first preset**.

Completed steps collapse. The wizard can be revisited, e.g. to replace the token.

### Presets list

Ordered list (`sync:presetIndex`) showing name, target database and an issue badge. Actions: **New**, **Edit**, **Duplicate**, **Delete** (with confirm), drag to reorder.

### Preset editor

1. Name + **database picker** (`ds/list`).
2. **Property table** (from `ds/schema`): every writable property, with a **source** selector (Not mapped / Extractor + fallbacks / Ask in popup / Static value) and an **Editable in popup** toggle. Extractor choices are filtered by the [compatibility matrix](./preset-model.md#compatibility-matrix). Read-only property types appear disabled with a reason.
3. **Screenshot**: files property (or none), "also add to page body".
4. **Cover**: none / screenshot / Open Graph image. **Icon**: none / favicon.
5. **Duplicate detection**: url/text property, or off.
6. Validation issues shown inline. Save is disabled while blocking issues remain.

### Settings

- Capture delay (ms) after page load.
- Screenshot JPEG quality.
- Connected workspace + **Disconnect** (`auth/clear`).
- Recent saves (`local:history`, last 20) with links.

### Import / Export

- **Export** downloads `sitecatch-presets-<date>.json` (`PresetExportFile`, presets only, never the token).
- **Import** opens a file picker, validates the file, and previews the presets with any id conflicts (replace / keep both) before writing. See [preset-model.md](./preset-model.md#import--export).
