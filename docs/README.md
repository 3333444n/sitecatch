# Sitecatch documentation

These docs are the **source of truth** for Sitecatch. Code follows the docs, and a change in behavior updates the docs in the same branch. If the code and the docs disagree, raise it.

**Status:** v0.1.0 (2026-10-18), install from source or as a signed `.xpi` ([releasing.md](./releasing.md)), manually tested end to end in Firefox. Repository: <https://github.com/3333444n/sitecatch>. What's verified and what's next: [testing.md](./testing.md#manual-e2e-results), [roadmap.md](./roadmap.md#next).

## For users

| Doc | Contents |
| --- | --- |
| [setup-guide.md](./setup-guide.md) | Create a personal access token (recommended) or internal connection, paste the token, share databases (connections only), first preset, troubleshooting, screenshots to capture |
| [permissions-privacy.md](./permissions-privacy.md) | Each permission and why, data flow, what is stored where, token handling |
| [ui-flows.md](./ui-flows.md) | Popup states, setup wizard, preset editor, settings, import/export |

## For contributors

| Doc | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | Components, message protocol, capture/save/duplicate flows, storage layout, cross-browser notes |
| [preset-model.md](./preset-model.md) | Preset/mapping types, value sources, compatibility matrix, validation, sync, import/export, examples |
| [extractors.md](./extractors.md) | Each extractor's sources and output, adding a new extractor |
| [notion-api.md](./notion-api.md) | API version, data sources, endpoints, file upload, property shapes, rate limits, error mapping |
| [testing.md](./testing.md) | Commands, unit test strategy, manual E2E checklist and latest results |
| [roadmap.md](./roadmap.md) | v0.1.0 scope, next items and known issues, later plans |
| [releasing.md](./releasing.md) | Releasing / signing for Firefox: AMO keys, version bump, `pnpm sign:firefox`, installing the `.xpi`, permanent add-on id |
| [decisions/](./decisions/README.md) | Architecture decision records (ADRs) |

Start with [AGENTS.md](../AGENTS.md) for commands, workflow and code conventions. Setup screenshots are marked `<!-- SCREENSHOT: setup-N -->` and stored once, as `public/setup/setup-N.png` (shown in the setup wizard and linked from the docs as `../public/setup/setup-N.png`). See the capture checklist in [setup-guide.md](./setup-guide.md#screenshots-to-capture).
