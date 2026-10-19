# 0006. Map Notion properties by id

- Status: Accepted
- Date: 2026-10

## Context

Users rename Notion properties often. A preset keyed by property name would silently break. The Notion API accepts property ids as keys when writing page properties, and ids stay the same across renames.

## Decision

`Mapping.propertyId` (and `screenshot.filesPropertyId`, `dedupe.propertyId`) store the **property id**. `propertyName` and `propertyType` are snapshots, used only to detect renames and type changes.

## Consequences

- Renames keep working and only show an informational notice.
- Type changes and deletions are detected against the live schema and block saving until fixed ([preset-model.md](../preset-model.md#validation)).
- Exported presets are tied to specific data sources. Importing into another workspace means re-mapping.
