# 0010. Multiple workspace connections, each preset owns its workspace

- Status: Accepted
- Date: 2026-11
- Amends: [0003](./0003-internal-token-no-backend.md), [0009](./0009-personal-access-token-default.md)

## Context

A Notion token (personal access token or internal connection) belongs to exactly one workspace. v0.1 stored a single token (`local:auth`), so people with databases in several workspaces (work + personal, client workspaces) could only save into one of them. There is still no backend and no OAuth.

## Decision

- Sitecatch stores **several connections** (`local:connections`, `Connection[]`), one per workspace, each with its own token. `Connection.id` is the Notion workspace id (`bot.workspace_id` from `GET /v1/users/me`) when reported, otherwise a random UUID. At most one connection per workspace: a new token for a connected workspace replaces that connection's token in place.
- **Each preset owns its workspace** (`Preset.connectionId`, preset `schemaVersion` 2). Picking a preset implicitly picks the workspace. There is **no global "active workspace" switcher**. The popup groups presets by workspace when more than one is connected.
- One resolution rule (`src/lib/presets/connection.ts`): the preset's connection if connected here; an unassigned (`null`) preset uses the only connection when there is exactly one; anything else is unresolved and saving returns an actionable `no-token` error with `edit-preset`.
- v0.1's `local:auth` is copied into `local:connections` once (idempotent, not deleted, so a downgrade keeps working) and cleared when that connection is removed. v1 presets migrate to `connectionId: null`.

## Consequences

- Message protocol: `auth/*` became `conn/add` / `conn/list` / `conn/remove`; `ds/list` and `ds/schema` take a `connectionId`; `dup/check` and `save/start` take the connection from the preset. The background memoizes one client (and rate-limit queue) per connection.
- Using the workspace id as `Connection.id` lets synced presets resolve on another device as soon as it connects the same workspace. Tokens still never sync, so every device connects each workspace itself.
- Adding a second workspace pins existing unassigned presets to the first one, so they don't silently become unresolved.
- Imported presets keep their `connectionId`; if that workspace isn't connected here they show as needing a workspace until the user connects it or picks another one in the editor.
- Data source ids are globally unique, so the schema cache key is unchanged; it is cleared whenever a connection's token changes or a connection is removed.
