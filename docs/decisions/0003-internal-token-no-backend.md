# 0003. Internal connection token, no backend

- Status: Accepted
- Date: 2026-10

## Context

Notion offers public connections (OAuth), which need a client secret and therefore a server for the token exchange. It also offers internal connections, which have a static API token. Other clippers ride the user's notion.so cookie session, which is fragile (login loops) and needs broad permissions. We want zero infrastructure, zero accounts, and the official API.

## Decision

Users create their own **internal connection** and paste its API token into Sitecatch. There is **no backend**: the extension calls `api.notion.com` directly. The token stays in `storage.local` and is sent only to Notion.

## Consequences

- No server to run, secure or pay for. Nobody but Notion sees user data.
- Setup takes more steps (create connection, copy token, share each database). The guided wizard and [setup-guide.md](../setup-guide.md) exist to offset that.
- Only Workspace Owners can create internal connections.
- Each database must be shared with the connection explicitly. This also limits what a leaked token can reach.
- OAuth (one-click) and personal access tokens remain options for later ([roadmap.md](../roadmap.md)).
