# Sitecatch documentation

These docs are the **source of truth** for Sitecatch. Code follows the docs, and a change in behavior updates the docs in the same branch. If the code and the docs disagree, raise it.

**Status:** v0.1.0 (2026-10-18), install from source or as a signed `.xpi` ([releasing.md](./releasing.md)), manually tested end to end in Firefox. Unreleased on `main`: multiple workspace connections and relation properties ([roadmap.md](./roadmap.md#unreleased)). Repository: <https://github.com/3333444n/sitecatch>. What's verified and what's next: [testing.md](./testing.md#manual-e2e-results), [roadmap.md](./roadmap.md#next).

## For users

| Doc | Contents |
| --- | --- |
| [setup-guide.md](./setup-guide.md) | Create a personal access token (recommended) or internal connection, paste the token, share databases (connections only), more than one workspace, first preset, troubleshooting, screenshots to capture |
| [permissions-privacy.md](./permissions-privacy.md) | Each permission and why, data flow, what is stored where, token handling (one token per workspace) |
| [ui-flows.md](./ui-flows.md) | Popup states (presets grouped by workspace, relation picker), setup wizard and Workspaces, preset editor, settings, import/export |

## For contributors

| Doc | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | Components, message protocol, workspaces (connections, preset resolution, v0.1 migration), capture/save/duplicate flows, storage layout, cross-browser notes |
| [preset-model.md](./preset-model.md) | Preset/mapping types (schema v2, `connectionId`), value sources, compatibility matrix, relations, validation, sync, migrations, import/export, examples |
| [extractors.md](./extractors.md) | Each extractor's sources and output, adding a new extractor |
| [notion-api.md](./notion-api.md) | API version, data sources, endpoints, relations, file upload, property shapes, rate limits, error mapping |
| [testing.md](./testing.md) | Commands, unit test strategy, manual E2E checklist and latest results |
| [roadmap.md](./roadmap.md) | v0.1.0 scope, unreleased work, next items and known issues, later plans |
| [releasing.md](./releasing.md) | Releasing / signing for Firefox: AMO keys, version bump, `pnpm sign:firefox`, installing the `.xpi`, permanent add-on id |
| [decisions/](./decisions/README.md) | Architecture decision records: [0001](./decisions/0001-wxt-mv3-firefox-first.md) WXT + MV3, Firefox-first · [0002](./decisions/0002-preact.md) Preact · [0003](./decisions/0003-internal-token-no-backend.md) pasted token, no backend · [0004](./decisions/0004-plain-fetch-client.md) plain fetch client · [0005](./decisions/0005-presets-in-storage-sync.md) presets in storage.sync · [0006](./decisions/0006-map-properties-by-id.md) map properties by id · [0007](./decisions/0007-screenshot-jpeg-file-upload.md) screenshot via File Upload · [0008](./decisions/0008-agent-worktree-workflow.md) agent worktree workflow · [0009](./decisions/0009-personal-access-token-default.md) personal access token default · [0010](./decisions/0010-multiple-workspace-connections.md) multiple workspace connections |

Start with [AGENTS.md](../AGENTS.md) for commands, workflow and code conventions. Setup screenshots are marked `<!-- SCREENSHOT: setup-N -->` and stored once, as `public/setup/setup-N.png` (shown in the setup wizard and linked from the docs as `../public/setup/setup-N.png`). See the capture checklist in [setup-guide.md](./setup-guide.md#screenshots-to-capture).
