# FORTIFIED Theme Changes

Custom Shopify sections, snippets, and templates built on top of the Horizon theme for the FORTIFIED hydration electrolyte brand.

## How to use

1. The Horizon theme is the base. Nothing in Horizon was deleted or rewritten — only added or wired up.
2. Three templates were updated to use the new Fortified sections: `templates/index.json`, `templates/product.json`, and a new `templates/page.fortified-landing.json` page template.
3. Every Fortified section, block, and snippet is namespaced with `fortified-` to avoid collisions with Horizon files.
4. All sections expose a `color_scheme` setting and use `color-{{ section.settings.color_scheme }}` for theming.

## Files created

### Layout

- **`layout/theme.liquid`** (modified) — Added Google Fonts (Bebas Neue + DM Sans 400/500/600/700), the global `--fortified-*` CSS custom properties, and the Loop Subscriptions `<script>` (`https://cdn.loopwork.co/loop.js`) gated by the `loop_script_loaded` flag so it only loads once.

### Documentation

- **`figma-tokens.md`** — Token summary (colors, typography, spacing, radii, breakpoints) derived from the Figma file `v5mQNpxn2DXVu8k3Ny6aZW`. The Figma MCP encountered an API overload while extracting the full canvas, so values fall back to `DESIGN_SPEC.md` per the task's escape clause. Refine when the Figma MCP can re-read the file.

### Shared / Header / Footer sections

- **`sections/fortified-announcement-bar.liquid`** — Scrolling marquee ticker, configurable colors and speed, duplicated content for seamless loop, respects `prefers-reduced-motion`.
- **`sections/fortified-header.liquid`** — Sticky teal nav with wordmark/logo, up to 6 menu links, account + cart icons, mobile hamburger drawer (per-instance JS).
- **`sections/fortified-footer.liquid`** — 4-column footer with brand description, two link-list columns, newsletter signup (uses Shopify `{% form 'customer' %}`), inline Instagram + TikTok SVG icons, legal bottom bar.

### Homepage sections

- **`sections/fortified-hero.liquid`** — 55/45 split hero with image left/right toggle, eyebrow + heading + body + dual CTAs, stacks on mobile (image above text).
- **`sections/fortified-press-logos.liquid`** — Horizontal press logo row, grayscale by default + colorize on hover, 6 image picker slots with alt text fields.
- **`sections/fortified-product-feature.liquid`** — Eyebrow / heading / body + up to 4 product images with slight rotation/translate effect, mobile horizontal scroll.
- **`sections/fortified-dark-lifestyle.liquid`** — Dark grid section with `fortified-lifestyle-photo` blocks (image + benefit badge), 2-col mobile / 5-col desktop.
- **`sections/fortified-stats.liquid`** — Stats grid with two block types: `fortified-stat` (CSS bar chart) and `fortified-checklist-card`.
- **`sections/fortified-ingredients-tabs.liquid`** — Tab system with `fortified-tab` + `fortified-ingredient` blocks, vanilla JS tab switching.
- **`sections/fortified-lifestyle-strip.liquid`** — Full-bleed horizontal image strip, `nowrap` + `clamp()` widths, mobile-native `-webkit-overflow-scrolling: touch`.
- **`sections/fortified-faq.liquid`** — Split-layout FAQ with CSS-only `<details>`/`<summary>` accordion (no JS), `max-height` open/close transition.
- **`sections/fortified-b2b-split.liquid`** — Two side-by-side full-bleed background-image cards with text overlay and per-block overlay opacity.
- **`sections/fortified-subscribe-save.liquid`** — Dark Subscribe & Save section with up to 4 checklist benefits, optional background image with gradient overlay, CTA.

### PDP

- **`sections/fortified-product-main.liquid`** — Main PDP section. Implements all 18 block types: gallery, info, variant-picker, purchase-options, subscription, atc, upsell, trust-badges, brand-story, clinically-backed, testimonial, stats-row, flavors-cta, comparison-table (with sibling `fortified-comparison-row` blocks), lifestyle-strip, reviews, faq, subscribe.
- Below-the-fold blocks render as standalone sub-sections via partials in `snippets/fortified-*.liquid`.

### PDP snippets (one per PDP block)

- `snippets/fortified-product-gallery.liquid` — Main image + thumbnail strip + click-to-zoom (per-instance JS).
- `snippets/fortified-product-info.liquid` — Product title, optional metafield-driven subhead, Judge.me star badge.
- `snippets/fortified-variant-picker.liquid` — Flavor swatches using variant images with radio inputs, broadcasts `fortified:variantchange` event on change.
- `snippets/fortified-purchase-options.liquid` — 1-pouch vs N-pouch toggle, quantity stepper (44px touch targets), compare-at price.
- `snippets/fortified-subscription.liquid` — Loop widget container with `data-loop-variant-id`, fallback radio UI for one-time vs Subscribe & Save with discount badge. Listens for `fortified:variantchange` to update.
- `snippets/fortified-atc.liquid` — Full-width teal pill ATC, disabled when sold out, optional price suffix.
- `snippets/fortified-upsell.liquid` — Add Creatine upsell card with separate form post to `/cart/add`.
- `snippets/fortified-trust-badges.liquid` — Horizontal trust badge row, up to 6 images.
- `snippets/fortified-brand-story.liquid` — Dark background story with image, eyebrow, heading, CTA.
- `snippets/fortified-clinically-backed.liquid` — Heading + body + ingredient checklist (auto-fit grid).
- `snippets/fortified-testimonial.liquid` — Split photo + quote testimonial.
- `snippets/fortified-stats-row.liquid` — 3 inline stats.
- `snippets/fortified-flavors-cta.liquid` — Dark CTA section with optional background image.
- `snippets/fortified-lifestyle-strip-block.liquid` — PDP-scoped lifestyle strip variant.
- `snippets/fortified-reviews.liquid` — Judge.me preview badge (optional) + full review widget.
- `snippets/fortified-faq-block.liquid` — PDP-scoped FAQ block.
- `snippets/fortified-subscribe-block.liquid` — PDP-scoped Subscribe & Save block.

### Landing page sections

- **`sections/fortified-landing-hero.liquid`** — Teal gradient hero with split layout, headline lines, benefit list blocks (`fortified-benefit-item`), 3 floating product images with rotation/drop-shadow, asterisk disclaimer.
- **`sections/fortified-stats-bar.liquid`** — Single-row dark stats data bar (no heading), up to 6 stat pairs with bullet separators.
- **`sections/fortified-featured-product-card.liquid`** — Split card: product image + badges/rating on left, info + checklist + CTA on right.
- **`sections/fortified-day-benefits.liquid`** — Dark hero with `fortified-day-column` blocks (5 columns desktop, horizontal scroll on mobile).
- **`sections/fortified-reviews-section.liquid`** — Standalone Judge.me carousel widget section.
- **`sections/fortified-comparison-table-section.liquid`** — Standalone version of the comparison table with `fortified-comparison-row` blocks.

### Shared base snippet

- **`snippets/fortified-base.liquid`** — Once-per-page CSS for the brand tokens, container, eyebrow, headings, body text, buttons (primary/ghost/dark/white), checklist, badges. Idempotent — guarded by `fortified_base_loaded`.

### Templates

- **`templates/index.json`** (rewritten) — Wires Fortified homepage sections in the spec'd order.
- **`templates/product.json`** (rewritten) — Single `fortified-product-main` section with all 18 blocks pre-configured.
- **`templates/page.fortified-landing.json`** (new) — Landing page template. Use by creating a Shopify page in Admin and selecting "fortified-landing" as its template.

## Architecture rules followed

- Every section schema includes a `presets` array with `category: "Fortified"` and `tag: null`.
- All section-scoped CSS uses `{% stylesheet %}` tags (snippets use `<style>` since stylesheet is section-scoped).
- All per-instance JS uses plain `<script>` tags (never `{% javascript %}`) because Shopify deduplicates by type and Liquid does not evaluate inside `{% javascript %}`.
- Color schemes are honored: each section exposes `color_scheme` and applies `color-{{ section.settings.color_scheme }}` to its root, picking up Horizon's existing `--color-background` / `--color-foreground` CSS vars.
- Strings containing apostrophes always use double quotes in Liquid (e.g. `"IT'S DAILY SUPPORT"`).
- No hardcoded product handles, image URLs, or links — everything is settings-driven.
- Images use `{{ image | image_url: width: N | image_tag: widths, sizes, ... }}` for responsive serving.
- Mobile-first responsive design: tested mentally at 375 / 768 / 1024 / 1280; touch targets ≥ 44px.

## Third-party integrations

### Loop Subscriptions

- Loop script is loaded once in `layout/theme.liquid` (gated by `loop_script_loaded`).
- The PDP form wrapper carries `data-loop-product-id="{{ product.id }}"`.
- The `fortified-subscription` widget container carries `data-loop-variant-id` and updates it via a `fortified:variantchange` custom event when the user switches flavor.
- Block settings: `subscription_discount_percentage` (range 5–30, default 15), `subscribe_label`, `one_time_label`.
- A native Liquid fallback radio UI renders selling plans when Loop hasn't hydrated yet.

### Judge.me Reviews

- Star badge: `{% render "judgeme_widgets", widget_type: "judgeme_preview_badge", concierge_install: true, product: product %}` — rendered inline next to the PDP title via `fortified-product-info.liquid`.
- Full review widget: `{% render "judgeme_widgets", widget_type: "judgeme_review_widget", concierge_install: true, product: product %}` — rendered in the PDP `fortified-reviews` block via `fortified-reviews.liquid`.
- Carousel widget: `{% render "judgeme_widgets", widget_type: "judgeme_carousel_widget", concierge_install: true %}` — rendered standalone in `fortified-reviews-section.liquid` (used on the landing page).

## Known limitations / manual steps

1. **Install the Judge.me Shopify app** — the `judgeme_widgets` snippet must be present in the theme for review rendering. If the app is not installed, the snippet renders will produce "snippet not found" errors. Either install Judge.me or wrap the render calls in `{% if shop.metafields.judgeme %}...{% endif %}` guards.
2. **Loop dashboard configuration** — The Loop script auto-hydrates the widget container, but you must configure your product in the Loop dashboard (subscription plans, discount tiers) for the widget to display real subscription options. The fallback radio UI uses Shopify's native selling plans when available.
3. **Figma token refinement** — The Figma MCP extraction failed mid-task (API overload). The token values in `figma-tokens.md` are derived from `DESIGN_SPEC.md`. To refine, re-open the Figma file at `v5mQNpxn2DXVu8k3Ny6aZW`, select a node, and run `mcp__figma__get_variable_defs` to capture exact named colors, then replace `--fortified-*` values in `layout/theme.liquid` and `snippets/fortified-base.liquid`.
4. **Color schemes** — The brand assumes `scheme-1` (light), `scheme-2` (dark/black), and `scheme-3` (teal). Configure these in the theme editor under Settings → Colors to match the brand palette. Default Horizon schemes are kept untouched.
5. **Page template** — To use the landing page, create a new Page in Shopify Admin and assign the `fortified-landing` template from the template dropdown.
6. **Product feature images** — `fortified-product-feature` defaults to up to 4 image-picker slots; populate these from the theme editor (or replace with `product` picker blocks if you prefer linking to live products).
