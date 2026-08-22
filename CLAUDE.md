# Fortified-Horizon-Theme — Working Agreement

Shopify Horizon-based theme for FORTIFIED® (drinkfortified.myshopify.com).
The theme "Fortified-Horizon-Theme/main" on that store is connected to this
repo via Shopify's GitHub integration and tracks `main` (two-way sync).

## Branch workflow (exactly 4 branches)

| Branch | Role |
|---|---|
| `Experiment001` | Sandbox. Features that are NOT ready for deployment get built and tried here. Breaking things here is the point. Connected to its own Shopify theme, so a push syncs to that theme — never to the live site. |
| `test` | Staging. Where a feature is perfected before it goes anywhere. Promote from `Experiment001` once it works; merge into `main` only when the user approves. |
| `main` | Production. Auto-syncs to the GitHub-connected theme — a push here IS a deploy (live site, once that theme is published). Shopify also commits customizer edits back here automatically. |
| `backup` | Known-good snapshot of `main`. Fast-forward it to `main` on every backup run. Never develop here. |

Flow: `Experiment001` → `test` → `main`, with `backup` trailing `main`.

Rules:
- Never push unapproved changes to `main`; perfect on `test`, merge on approval.
- Risky or unproven work belongs on `Experiment001`, not `test`.
- Do not create additional branches; no PRs unless explicitly requested.
- Before editing template/settings JSON, pull the latest from the theme (or
  `git pull`) first — stale local copies clobber user edits.
- After any approved merge to `main`, fast-forward `backup` when the user asks
  for a backup: `git push origin main:backup`.

### Shopify and apps commit back to these branches

`Experiment001` and `main` are both connected to Shopify themes, so the sync
runs two ways. Customizer edits AND app installs land as
"Update from Shopify for theme …" commits without warning — Loop Subscriptions
has re-injected its bundle code into `layout/theme.liquid`,
`snippets/cart-products.liquid` and `assets/loop_bundle.js` this way.

So: always `git fetch` and inspect before pushing. If a push is rejected, read
what landed before integrating — an app's live change can look like dead code
locally. Never assume a file is unused because nothing in the repo references
it today.

## Validation before any push

- JSON templates: parse (strip the leading `/* ... */` header first).
- Liquid: check `{% schema %}` JSON parses and liquid tag pairs balance.

## Parked work

- `docs/blog-post-structured-data.md` — full spec for BlogPosting + FAQPage
  JSON-LD on `sections/main-blog-post.liquid`. Deliberately NOT implemented:
  waiting on the first published blog post. Implement when an article goes live
  on the `news` blog. Note the FAQ schema must not ship without the FAQs also
  being rendered visibly on the page.

## Store context

- Old store (livefortified.com, CDN prefix 0612/2425/5547) is being retired;
  its full export lives in `migration/` (MIGRATION.md documents the rebuild).
- On the NEW store the theme deploys via the GitHub integration — no
  themeFilesUpsert needed for GitHub-tracked themes.
- Theme publishing and legal-policy writes are blocked via API; the user does
  those in Shopify admin.
