# Sitecatch documentation

These docs are the **source of truth** for Sitecatch. Code follows the docs, and a change in behavior updates the docs in the same branch. If the code and the docs disagree, raise it.

## For users

| Doc | Contents |
| --- | --- |
| [setup-guide.md](./setup-guide.md) | Create the Notion connection, paste the token, share databases, first preset, troubleshooting |
| [permissions-privacy.md](./permissions-privacy.md) | Each permission and why, data flow, what is stored where, token handling |
| [ui-flows.md](./ui-flows.md) | Popup states, setup wizard, preset editor, settings, import/export |

## For contributors

| Doc | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | Components, message protocol, capture/save/duplicate flows, storage layout, cross-browser notes |
| [preset-model.md](./preset-model.md) | Preset/mapping types, value sources, compatibility matrix, validation, sync, import/export, examples |
| [extractors.md](./extractors.md) | Each extractor's sources and output, adding a new extractor |
| [notion-api.md](./notion-api.md) | API version, data sources, endpoints, file upload, property shapes, rate limits, error mapping |
| [testing.md](./testing.md) | Commands, unit test strategy, manual E2E checklist |
| [roadmap.md](./roadmap.md) | v0 scope and later plans |
| [decisions/](./decisions/README.md) | Architecture decision records (ADRs) |

Start with [AGENTS.md](../AGENTS.md) for commands, workflow and code conventions. Setup screenshots are marked `<!-- SCREENSHOT: setup-N -->` and stored once, as `public/setup/setup-N.png` (shown in the setup wizard and linked from the docs as `../public/setup/setup-N.png`). See the capture checklist in [setup-guide.md](./setup-guide.md#screenshots-to-capture).
