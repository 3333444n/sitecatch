/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * App-level Notion types. These are *our* normalized shapes, not raw API
 * payloads; the Notion client (src/lib/notion/) maps API responses into them.
 * Targets Notion API version 2026-03-11 (data-source endpoints).
 */

/** Every Notion property type we may encounter in a data source schema. */
export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'people'
  | 'files'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'relation'
  | 'formula'
  | 'rollup'
  | 'created_time'
  | 'created_by'
  | 'last_edited_time'
  | 'last_edited_by'
  | 'unique_id'
  | 'verification'
  | 'button'
  /** Any type Notion adds that we don't know about yet. Treated as read-only. */
  | 'unsupported';

/** Property types Sitecatch can write values into (v0). */
export type WritablePropertyType = Extract<
  NotionPropertyType,
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'files'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
>;

export const WRITABLE_PROPERTY_TYPES: readonly WritablePropertyType[] = [
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'files',
  'checkbox',
  'url',
  'email',
  'phone_number',
] as const;

/** Notion's named colors for select/multi_select/status options. */
export type NotionColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

export interface SelectOption {
  /** Absent for options we intend to create on save. */
  id?: string;
  name: string;
  color?: NotionColor;
}

/** Icon of a page/database/data source, normalized. */
export type NotionIcon =
  | { kind: 'emoji'; emoji: string }
  | { kind: 'url'; url: string };

/** One entry in the "pick a database" list (POST /v1/search, filter data_source). */
export interface DataSourceSummary {
  /** Data source id — what presets store and pages are created under. */
  id: string;
  /** Plain-text name ("Untitled" if empty). */
  name: string;
  /** Parent database id, when known. */
  databaseId?: string;
  icon?: NotionIcon;
  /** Link to open the database in Notion. */
  url?: string;
}

export interface PropertySchema {
  /** Stable property id (survives renames). Presets map by this. */
  id: string;
  /** Current display name. */
  name: string;
  type: NotionPropertyType;
  /** Options for select / multi_select / status. */
  options?: SelectOption[];
}

/** Schema of a data source (GET /v1/data_sources/{id}). */
export interface DataSourceSchema {
  id: string;
  name: string;
  /** Keyed by property id. */
  properties: Record<string, PropertySchema>;
  /** Id of the single `title` property. */
  titlePropertyId: string;
}

/** Minimal reference to a created/updated page. */
export interface NotionPageRef {
  id: string;
  /** https://www.notion.so/... link for "Open in Notion". */
  url: string;
}

/** An existing page whose dedupe property matches the URL being saved. */
export interface DuplicateMatch {
  pageId: string;
  url: string;
  /** Plain-text title of the existing page. */
  title: string;
  /** ISO 8601 timestamp. */
  lastEditedTime: string;
}

// ---------------------------------------------------------------------------
// Request body types for POST /v1/pages and PATCH /v1/pages/{id}.
// Single source: src/lib/properties builds these, the client sends them.
// Shapes follow https://developers.notion.com/reference/page-property-values
// ---------------------------------------------------------------------------

/** One rich-text segment (we only ever write plain text). */
export interface NotionRichTextItem {
  type: 'text';
  text: { content: string };
}

/** Reference to a completed single-part file upload. */
export interface NotionFileUploadRef {
  type: 'file_upload';
  file_upload: { id: string };
}

/** Reference to an externally hosted file. */
export interface NotionExternalFileRef {
  type: 'external';
  external: { url: string };
}

/** A file reference usable as cover, icon or image block. */
export type NotionFileRef = NotionFileUploadRef | NotionExternalFileRef;

/** Page icon in a request body. */
export type NotionIconRequest = NotionFileRef | { type: 'emoji'; emoji: string };

/** One item of a `files` property value (the API requires a `name`). */
export type NotionFileValue =
  | (NotionFileUploadRef & { name: string })
  | (NotionExternalFileRef & { name: string });

/** `date` property value. `start`/`end` are ISO 8601 (date-only or date-time with offset). */
export interface NotionDateValue {
  start: string;
  end?: string;
}

/** Request JSON for one writable property value. */
export type NotionPropertyValue =
  | { title: NotionRichTextItem[] }
  | { rich_text: NotionRichTextItem[] }
  | { number: number }
  | { checkbox: boolean }
  | { select: { name: string } }
  | { multi_select: { name: string }[] }
  | { status: { name: string } }
  | { date: NotionDateValue }
  | { files: NotionFileValue[] }
  | { url: string }
  | { email: string }
  | { phone_number: string };

/** Image block appended to the page body. */
export interface NotionImageBlock {
  object: 'block';
  type: 'image';
  image: NotionFileRef;
}

/** Block objects Sitecatch appends to a page body. */
export type NotionBlockRequest = NotionImageBlock;

/** Icon, cover and body blocks derived from a preset (see buildPageExtras). Spreads into a page body. */
export interface PageExtras {
  icon?: NotionIconRequest;
  cover?: NotionFileRef;
  /** Max 100 per request. */
  children?: NotionBlockRequest[];
}

/** Shared fields of create/update page bodies. Property values are keyed by property id (or name). */
export interface NotionPageBody {
  properties?: Record<string, NotionPropertyValue>;
  /** `null` clears the icon (PATCH only). */
  icon?: NotionIconRequest | null;
  /** `null` clears the cover (PATCH only). */
  cover?: NotionFileRef | null;
  /** Blocks appended on create (max 100). Not accepted by PATCH. */
  children?: NotionBlockRequest[];
}

/** Body for POST /v1/pages. */
export interface NotionCreatePageBody extends NotionPageBody {
  parent: { type: 'data_source_id'; data_source_id: string };
}

/** Body for PATCH /v1/pages/{id}. */
export type NotionUpdatePageBody = Omit<NotionPageBody, 'children'>;
