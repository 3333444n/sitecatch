# 0009. Personal access token as the default

- Status: Accepted
- Date: 2026-10
- Amends: [0003](./0003-internal-token-no-backend.md)

## Context

[ADR 0003](./0003-internal-token-no-backend.md) chose a pasted internal connection token. In practice that setup has two sharp edges: only Workspace Owners can create an internal connection, and every database must be shared with it (••• → Connections), which is the most common reason "my database doesn't show up". Notion now offers **personal access tokens** (PATs), created in the Developer portal, that act as the user, see everything the user can open, and expire on a schedule the user picks. Notion also renamed "integrations" to **connections** in its UI and docs.

## Decision

Sitecatch supports both token kinds (`AuthState.tokenKind`: `personal` | `connection`). The setup wizard offers the **personal access token first, marked Recommended**; the internal connection stays available for people who want a narrower token or whose workspace restricts PATs. Both are sent identically (`Authorization: Bearer …`). There is still no backend.

## Consequences

- Setup is shorter for most people: no per-database sharing step and no Workspace Owner requirement (subject to the workspace's PAT policy).
- A leaked PAT reaches everything the user can open until it expires or is revoked, not just shared databases. [permissions-privacy.md](../permissions-privacy.md#token-storage) says so plainly, and the internal connection remains the narrower option.
- PATs expire. An expired token shows up as `invalid-token` with an **Open setup** action, and the user pastes a new one.
- Copy across the UI, error messages and docs is token-kind-neutral ("token", "connection"), with method-specific hints where they differ (the share step and "Can't see your database?" causes).
