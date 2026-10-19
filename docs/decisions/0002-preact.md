# 0002. Preact + signals for UI

- Status: Accepted
- Date: 2026-10

## Context

The popup must open fast and the bundle should stay small. Contributors and agents should be able to write the UI with familiar JSX.

## Decision

Use **Preact** with **@preact/signals** for popup and options. Style with plain CSS custom properties (`src/ui/theme.css`, light/dark). No CSS framework, no component library.

## Consequences

- About 4 KB runtime, React-like API, JSX that agents write reliably.
- Signals give simple shared state without a store library.
- Some React-only libraries don't work. We build the few inputs we need ourselves (`src/ui/property-inputs/`).
