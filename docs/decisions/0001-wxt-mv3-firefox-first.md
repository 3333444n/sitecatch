# 0001. WXT + Manifest V3, Firefox-first

- Status: Accepted
- Date: 2026-10

## Context

Sitecatch targets Firefox users first. The official Notion Web Clipper is no longer listed on AMO, and other options are thin. Chrome should work too. Writing raw WebExtension boilerplate for two browsers (manifest differences, event page vs service worker, build/zip) is tedious, and AI agents get it wrong easily.

## Decision

Use **WXT** with TypeScript and **Manifest V3** for both browsers (`manifestVersion: 3`). Firefox is the primary target (`build:firefox`, `web-ext lint` in `pnpm check`). Chrome builds are smoke-tested. Gecko `strict_min_version` is 140 (desktop) / 142 (Android) for `data_collection_permissions`.

## Consequences

- One codebase and one manifest definition (`wxt.config.ts`). WXT handles the event page (Firefox) vs service worker (Chrome) differences.
- MV3 means a non-persistent background. All state lives in storage, and listeners are registered at top level ([architecture.md](../architecture.md#cross-browser-notes)).
- Typed storage, `fakeBrowser` for tests, and store zips come built in.
- Older Firefox versions (< 140) aren't supported.
