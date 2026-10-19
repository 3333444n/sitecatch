/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * A preset = target data source + how each Notion property gets its value.
 * Presets are stored in storage.sync (one item per preset, see
 * src/lib/storage/items.ts) and are exportable as JSON, so the shape is
 * versioned via `schemaVersion`.
 */
import type { ExtractorId } from '@/lib/extract/types';
import type { WritablePropertyType } from '@/lib/notion/types';

/** A file attached to a `files` property from the popup form. */
export type FileRef =
  /** The screenshot from the current capture (uploaded once, reused for cover/body image). */
  | { kind: 'screenshot' }
  /** An external URL (favicon, og:image). */
  | { kind: 'external'; url: string; name?: string };

/**
 * A value the user can see/edit in the popup form, tagged by input kind.
 * Mapping from Notion property type:
 *   title, rich_text, url, email, phone_number → 'text'
 *   number → 'number'; checkbox → 'checkbox'
 *   select, status → 'select' (option *name*); multi_select → 'multi_select' (names)
 *   date → 'date'; files → 'files'
 */
export type FormValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number | null }
  | { kind: 'checkbox'; value: boolean }
  | { kind: 'select'; value: string | null }
  | { kind: 'multi_select'; value: string[] }
  | { kind: 'date'; value: { start: string; end?: string } | null }
  | { kind: 'files'; value: FileRef[] };

export type FormValueKind = FormValue['kind'];

/** Form state keyed by Notion property id. */
export type FormValues = Record<string, FormValue>;

/** A fixed value configured in the preset editor (same shape as a form value). */
export type StaticValue = FormValue;

/** Where a mapped property gets its value. */
export type ValueSource =
  | {
      kind: 'extractor';
      extractor: ExtractorId;
      /** Tried in order when the primary extractor yields nothing (e.g. ogTitle → title). */
      fallbacks?: ExtractorId[];
    }
  | {
      kind: 'ask';
      /** Pre-filled value in the popup. */
      default?: FormValue;
      /** Block saving until filled. */
      required?: boolean;
    }
  | { kind: 'static'; value: StaticValue };

export interface Mapping {
  /** Notion property id (stable across renames). */
  propertyId: string;
  /** Snapshot of the name when the mapping was saved — used to detect/display renames. */
  propertyName: string;
  /** Snapshot of the type when the mapping was saved — used to detect type changes. */
  propertyType: WritablePropertyType;
  source: ValueSource;
  /** Show this property in the popup form so the user can tweak the value before saving. */
  editableInPopup: boolean;
}

export interface Preset {
  schemaVersion: 1;
  /** Random id (crypto.randomUUID()). */
  id: string;
  name: string;
  dataSourceId: string;
  /** Snapshot for display when offline / before schema fetch. */
  dataSourceName: string;
  /** Only mapped properties are shown/written. */
  mappings: Mapping[];
  screenshot: {
    /** `files` property to attach the screenshot to, or null for none. */
    filesPropertyId: string | null;
    /** Also append the screenshot as an image block in the page body. */
    bodyImage: boolean;
  };
  cover: 'none' | 'screenshot' | 'ogImage';
  icon: 'none' | 'favicon';
  dedupe: {
    /** `url` (or text) property compared against the normalized page URL; null disables. */
    propertyId: string | null;
  };
  /** ISO 8601. */
  updatedAt: string;
}

/** A problem found when validating a preset against the live data source schema. */
export interface PresetIssue {
  propertyId: string;
  /**
   * missing: property deleted or no longer visible
   * renamed: same id, different name (informational; mapping still works)
   * type-changed: property type differs from the snapshot (mapping must be fixed)
   * option-missing: a static/default select option no longer exists (will be created or must be fixed)
   */
  kind: 'missing' | 'renamed' | 'type-changed' | 'option-missing';
  /** User-facing explanation. */
  detail: string;
}

/** JSON export/import envelope. */
export interface PresetExportFile {
  format: 'sitecatch-presets';
  version: 1;
  /** ISO 8601. */
  exportedAt: string;
  presets: Preset[];
}
