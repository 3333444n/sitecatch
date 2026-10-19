# 0004. Plain fetch Notion client

- Status: Accepted
- Date: 2026-10

## Context

Sitecatch uses about eight endpoints. It needs a pinned API version, its own request queue, precise retry rules (never retry page creation), multipart upload from a background context, and errors mapped to actionable user messages. The official SDK adds bundle weight and its own retry behavior.

## Decision

Write a small client on top of `fetch` in `src/lib/notion/`. It pins `Notion-Version: 2026-03-11`, uses the data-source endpoints, includes a rate-limit queue (about 3 req/s, `Retry-After`), uses `FormData` for uploads, and maps every failure to `AppError`.

## Consequences

- Full control over retries and errors. Small bundle. Easy to unit test with mocked `fetch`.
- We maintain the request/response types we use (`src/lib/notion/types.ts` holds our normalized shapes), and have to follow Notion API changes ourselves.
