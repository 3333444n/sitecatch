# Security policy

## Supported versions

Sitecatch is early (v0.x). Security fixes go into the latest release and `main` only.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report them privately through GitHub's private vulnerability reporting:

1. Go to the repository's [Security tab → Report a vulnerability](https://github.com/3333444n/sitecatch/security/advisories/new).
2. Describe the issue, how to reproduce it, the affected version (or commit), browser and version, and the impact you expect.

Never include a real Notion token, AMO key or private workspace content in a report. If a token was exposed, revoke it in Notion's Developer portal first.

The maintainer will acknowledge the report, keep you updated in the advisory, and credit you when the fix is published (unless you'd rather stay anonymous). This is a volunteer project, so there is no fixed response time, but security reports are prioritized.

## Scope

In scope, for example:

- Anything that could leak a stored Notion token: logging, syncing, exporting, displaying it, or sending it anywhere other than `api.notion.com`.
- Sitecatch sending page data anywhere other than `api.notion.com`, or without the user clicking Save (beyond the documented duplicate check).
- Pages being able to influence the extension through the capture script (e.g. script injection via extracted values).
- Requesting broader permissions than documented in [docs/permissions-privacy.md](docs/permissions-privacy.md), or loading remote code.
- Release tooling (`pnpm sign:firefox`) exposing AMO credentials.

Out of scope: Notion's own API or apps (report those to Notion), and attacks that require someone who already has access to your OS account or browser profile (`storage.local` is not encrypted; see [docs/permissions-privacy.md](docs/permissions-privacy.md#token-storage)).
