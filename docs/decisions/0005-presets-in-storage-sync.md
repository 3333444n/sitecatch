# 0005. Presets in storage.sync, one item per preset

- Status: Accepted
- Date: 2026-10

## Context

Users want their presets on every browser they use without an account. `storage.sync` allows about 100 KB total, 8 KB per item and 512 items, and Chrome also limits write rate. Storing all presets in one item would hit the 8 KB per-item limit quickly, and every edit would rewrite all of them.

## Decision

Store each preset as its own item `sync:preset:<id>`, plus an ordered index `sync:presetIndex`. Token, settings and history stay in `storage.local`. Jobs and the schema cache go in `storage.session`. Also provide JSON import/export.

## Consequences

- Each preset has the full 8 KB budget, and edits write a single item.
- Index and items can briefly disagree across sync. Readers ignore missing items and index entries without a preset.
- In Firefox, sync only works with a Mozilla account with add-on sync enabled. Export/import covers everyone else.
- The token is never synced.
