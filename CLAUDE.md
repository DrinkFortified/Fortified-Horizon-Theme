# Fortified-Horizon-Theme — Working Agreement

Shopify Horizon-based theme for FORTIFIED® (drinkfortified.myshopify.com).
The theme "Fortified-Horizon-Theme/main" on that store is connected to this
repo via Shopify's GitHub integration and tracks `main` (two-way sync).

## Branch workflow (exactly 3 branches)

| Branch | Role |
|---|---|
| `main` | Production. Auto-syncs to the GitHub-connected theme — a push here IS a deploy (live site, once that theme is published). Shopify also commits customizer edits back here automatically. |
| `test` | Staging. ALL new work is developed and pushed here first. Merge into `main` only when the user approves. |
| `backup` | Known-good snapshot of `main`. Fast-forward it to `main` on every backup run. Never develop here. |

Rules:
- Never push unapproved changes to `main`; build on `test`, merge on approval.
- Do not create additional branches; no PRs unless explicitly requested.
- Before editing template/settings JSON, pull the latest from the theme (or
  `git pull`) first — the customizer commits to `main` and stale local copies
  clobber user edits.
- After any approved merge to `main`, fast-forward `backup` when the user asks
  for a backup: `git push origin main:backup`.

## Validation before any push

- JSON templates: parse (strip the leading `/* ... */` header first).
- Liquid: check `{% schema %}` JSON parses and liquid tag pairs balance.

## Store context

- Old store (livefortified.com, CDN prefix 0612/2425/5547) is being retired;
  its full export lives in `migration/` (MIGRATION.md documents the rebuild).
- On the NEW store the theme deploys via the GitHub integration — no
  themeFilesUpsert needed for GitHub-tracked themes.
- Theme publishing and legal-policy writes are blocked via API; the user does
  those in Shopify admin.
