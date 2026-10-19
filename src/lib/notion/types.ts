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
