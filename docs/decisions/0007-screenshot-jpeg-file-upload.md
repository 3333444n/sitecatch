# 0007. Screenshot as JPEG via the File Upload API

- Status: Accepted
- Date: 2026-10

## Context

Screenshots are the main visual. Notion external URLs would need image hosting, which we don't have and don't want. Notion's File Upload API stores files in the workspace. Free workspaces cap files at 5 MiB, an unattached upload expires after 1 hour, and one upload id can be attached in several places.

## Decision

Capture the visible viewport with `tabs.captureVisibleTab` as **JPEG** (quality setting, default 0.85), downscaled to under about 4.5 MiB. Upload it **once** per save (`POST /v1/file_uploads` → `/send`) right before creating the page. Reuse the id for the files property, the cover and the body image block.

## Consequences

- Works on Free plans and needs no external hosting. One upload per save.
- JPEG loses some sharpness on text-heavy pages. That's acceptable for a thumbnail/cover.
- A save that stalls for more than an hour after upload would need a re-upload (unlikely, since the upload happens just before page creation).
- Visible viewport only. Full-page screenshots are out of scope for v0.
