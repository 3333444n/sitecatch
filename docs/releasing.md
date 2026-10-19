# Releasing / signing for Firefox

Release Firefox builds as a **signed `.xpi` on AMO's unlisted channel**. "Unlisted" means Mozilla signs the file but doesn't list it in the store, so you distribute it yourself (for example as a GitHub release asset). A public AMO listing is out of scope for now ([roadmap.md](./roadmap.md#later)).

Release builds stay installed across restarts, unlike the temporary add-on from `about:debugging` (see [README](../README.md#install-from-source)).

## The add-on id is permanent

`browser_specific_settings.gecko.id` in `wxt.config.ts` is **`sitecatch@sitecatch.app`**. v0.1.0 was signed under it on 2026-10-18. AMO ties the id to the add-on forever, and installed copies use it to update and to keep their storage (token, presets). Never change it.

Only the maintainer's AMO account can sign under this id. To sign a personal build of a fork with your own AMO account, change the id in your fork first.

## One-time setup: AMO API keys

1. Sign in at <https://addons.mozilla.org/developers/addon/api/key/> and generate credentials. You get a **JWT issuer** (`user:<digits>:<digits>`) and a **JWT secret**.
2. Copy `.env.example` to `.env.local` at the repo root (`.env.local` is git-ignored) and fill in:
   ```sh
   WEB_EXT_API_KEY=user:12345678:123
   WEB_EXT_API_SECRET=<the JWT secret>
   ```
   Or export both variables in your shell; environment variables take precedence over `.env.local`.

Don't `source` `.env.local` in a shell: a typo can make the shell print the secret in an error message. `pnpm sign:firefox` parses the file itself and never prints the values. If a secret ever leaks, revoke it on the same AMO page and generate a new one.

## Each release

1. **Bump `version`** in `package.json` (semver). AMO rejects a version it has already signed, so every signed build needs a new version.
2. **Update `CHANGELOG.md`**: move the `Unreleased` entries under the new version and date, and add its compare/tag link.
3. **Sign:** `pnpm sign:firefox`. It validates the keys, builds with `pnpm build:firefox`, then runs `web-ext sign -s .output/firefox-mv3 --channel=unlisted`. The signed `.xpi` lands in `web-ext-artifacts/` (git-ignored). Use `pnpm sign:firefox --dry-run` to check the keys and the build without uploading anything.
4. **Install** the `.xpi`: in Firefox open `about:addons` → gear icon → **Install Add-on From File…** → pick the file from `web-ext-artifacts/`. Installing a higher version over an existing install updates it in place and keeps your data.
5. Commit the version bump and changelog, tag `vX.Y.Z`, and attach the `.xpi` to the GitHub release if you share it.

## Troubleshooting

- **"WEB_EXT_API_KEY is missing" / "doesn't look like an AMO JWT issuer"**: check `.env.local` (or your environment). The key is the JWT issuer, not the secret.
- **Version already exists**: bump `version` in `package.json` and sign again.
- **Signing takes a while**: AMO validates the upload first. web-ext waits for approval and then downloads the signed file. Unlisted builds are usually signed automatically within minutes.
