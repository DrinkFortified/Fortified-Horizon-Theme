# FORTIFIED® — Store Migration Guide

Everything needed to replicate this store's structure on a **new Shopify
account**. The raw data lives in the JSON files beside this document; this
guide explains what each piece is, how the pieces wire together, and the
order to rebuild them in. Exported 2026-07-03 from the original store
(CDN prefix `cdn.shopify.com/s/files/1/0612/2425/5547`).

---

## 0. What's in this folder

| File | Contents |
|---|---|
| `metaobject-definitions.json` | All 15 metaobject definitions with full field schemas (7 custom + 8 Shopify-managed) |
| `metaobject-entries.json` | Every entry of the 7 custom types, keyed by type |
| `products.json` | All 3 products: descriptions, options, variants (SKU/barcode/price), media URLs, metafields, selling-plan group memberships |
| `collections.json` | 4 collections (all manual) with SEO descriptions and product membership |
| `menus.json` | 3 navigation menus with full item trees |
| `pages.json` | 7 pages with full HTML bodies |
| `shop-policies.json` | All 6 shop policies (privacy, terms, refund, shipping, subscription, contact) |
| `media-manifest.txt` | Every Content → Files asset URL + best rendition of each video |
| `download-media.sh` | Run before the old store closes — downloads all media locally |

The **theme itself** is the rest of this repository (`sections/`, `blocks/`,
`snippets/`, `assets/`, `templates/`, `config/`) — a complete mirror of the
"Fortified Main Theme", including all page/template JSON with section
settings. Upload it to the new store as a new theme (zip the repo or connect
the repo via Shopify's GitHub integration).

---

## 1. Custom metaobject definitions (create these FIRST)

The theme's PDP sections read product metafields that point at these
metaobjects, so they must exist before products are wired up. Full field
schemas are in `metaobject-definitions.json`; summary:

| Type | Purpose | Referenced by |
|---|---|---|
| `ingredient` | Reusable ingredient (name, amount, description, icon file) | `pdp_content.ingredients` (list) |
| `nutrient_fact` | One Nutrition-Facts row (label, amount, DV, indent, bold, divider) | `pdp_content.nutrients` (list) |
| `faq_item` | One PDP FAQ Q&A (question, answer, open_by_default, tags) | `pdp_content.faqs` (list) |
| `pdp_content` | Per-product PDP storytelling: hero, ingredients, stats ×3, testimonial, truth cards, supplement-facts callouts ×3, FAQ header | product metafield `fortified.pdp_content` |
| `comparison_row` | One comparison-table feature row | `pdp_extra.comparison_rows` (list) |
| `comparison_competitor` | One competitor column (name + newline-separated values) | `pdp_extra.comparison_competitors` (list) |
| `pdp_extra` | Per-product overrides: hero showcase, comparison table, subscribe & save | product metafield `fortified.pdp_extra` |

**Order matters**: create `ingredient`, `nutrient_fact`, `faq_item`,
`comparison_row`, `comparison_competitor` first (they're referenced), then
`pdp_content` and `pdp_extra` (their list fields validate against the
referenced definitions' IDs — pick the new store's definition IDs when
recreating the list-reference fields).

The `shopify--*` definitions (flavor, package-type, dietary-supplements,
etc.) are **Shopify-managed taxonomy** — they recreate themselves when you
assign category metafields on products; do not create them manually.

## 2. Metaobject entries

`metaobject-entries.json` holds every entry with `handle`, `displayName`,
and all field values. Recreate per type. Field values that are GIDs
(`gid://shopify/Metaobject/...` in list fields, `gid://shopify/MediaImage/...`
in icon/file fields) are **old-store IDs** — after recreating, re-link:

- `pdp_content.ingredients` / `.nutrients` / `.faqs` → new entries of those types
- `pdp_extra.comparison_rows` / `.comparison_competitors` → same
- `ingredient.icon`, `pdp_content.hero_image` → re-uploaded files (see §7)

Entry counts: ingredient 5 · pdp_content 3 · nutrient_fact 20 · faq_item 10
· comparison_row 13 · comparison_competitor 6 · pdp_extra 2.

## 3. Products

`products.json` — 3 products:

| Handle | Title | Variants (SKU) | Price |
|---|---|---|---|
| `everyday` | Everyday Hydration Powder with D3 + K2 | FOR-EDY-ORG-PCH-30, FOR-EDY-WTM-PCH-30 (Flavor: Salty Orange / Salty Watermelon) | $59.00 |
| `energy` | Energy Electrolyte Powder with Natural Caffeine | FOR-ENG-ORG-PCH-30, FOR-ENG-WTM-PCH-30 | $59.00 |
| `creatine` | Creatine Monohydrate Pure Unflavored | FOR-CRT-UNF-PCH-45 | $24.00 |

Barcodes, tags, full descriptions, SEO title/description metafields
(`global.title_tag` / `global.description_tag`), and media URLs are all in
the JSON. **Keep the handles identical** — theme settings reference products
by handle (`everyday`, `energy`, `creatine`).

After creating products, set their custom metafields:
- `fortified.pdp_content` (metaobject_reference → the product's pdp_content entry)
- `fortified.pdp_extra` (metaobject_reference → the product's pdp_extra entry, energy & everyday only)

## 4. Subscriptions / selling plans — ⚠️ app-owned, needs manual rebuild

All selling plans are owned by the **Loop Subscriptions app** (appId
5284869) and CANNOT be exported/imported — install Loop on the new store
and recreate:

| Group | Discount | Products |
|---|---|---|
| Hydration - Monthly 10% OFF | 10% recurring | everyday, energy |
| Hydration - Quarterly 20% OFF | 20% recurring | everyday, energy |
| Creatine - Monthly 50% OFF | 50% | creatine |
| Creatine - Quarterly 100% OFF | 100% (free w/ bundle) | creatine |
| Creatine - Quarterly 50% OFF | 50% (2nd unit) | creatine |

**Then re-map the new IDs into the theme.** These OLD-store IDs are baked
into theme settings and will all be different on the new store:

- `templates/index.json` → `ftd_product_selector_d_VQUQM3` settings and the
  slideover block in `section_jcLNtw`:
  - `loop_bundle_id: 7439`, `loop_bundle_variant_id: 14634`,
    `loop_bundle_discount_id: 49078`,
    `loop_bundle_api_selling_plan_id: 122825`,
    `loop_bundle_selling_plan_id: 2607644731`
  - creatine add-on plans: `addon_loop_plan_monthly: 2611478587`,
    `addon_loop_plan_quarterly_free: 2611511355`,
    `addon_loop_plan_quarterly_50off: 2611478587`
  - per-pouch Function blocks: Everyday `loop_plan_monthly: 2607349819`,
    `loop_plan_quarterly: 2607644731`. (Energy's and the slideover's pouch
    plan IDs were still `-` placeholders at export time — fill all four
    Function blocks on the new store.)
- The Loop bundle (`bundleId` etc.) is created in Loop's bundle dashboard;
  the wizard calls `bundle.loopwork.co/api/transactions/create` with those IDs.

## 5. Collections, menus, pages, policies

- **Collections** (`collections.json`): all 4 are manual — recreate and
  assign products. Keep handles (`frontpage`, `new-arrivals`, `hydration`,
  `supplements`).
- **Menus** (`menus.json`): `main-menu`, `footer`, `conceptthememenu` (the
  header uses `conceptthememenu`; the footer section references a menu by
  handle). Recreate with the same handles.
- **Pages** (`pages.json`): 7 pages with full HTML. `about-us` is loaded
  inside the homepage's fullscreen popup — keep its handle. The
  lead-capture consent text links `/policies/privacy-policy` and
  `/policies/terms-of-service`.
- **Policies** (`shop-policies.json`): paste each into Settings → Policies.

## 6. Apps in use (reinstall on the new store)

| App | Role |
|---|---|
| **Loop Subscriptions** (5284869) | All selling plans + bundle API (§4) |
| **Judge.me** | Homepage "Reviews" section renders its app blocks (preview badge + grid) |
| **Microsoft Clarity** | Analytics embed (enabled) |
| **SparkLayer B2B** | Wholesale (enabled) |
| Fonty, Shopify Inbox | Present but disabled in settings_data.json |

The Judge.me app-block IDs inside `templates/index.json` (the
`17821471407fe1169a` Reviews section) are store-specific — after installing
Judge.me, re-add its blocks to that section in the customizer.

## 7. Media / Content → Files

Theme code, product data, and metaobjects reference ~124 files by CDN URL
(`shopify://shop_images/...` resolves per-store — those references survive
migration **only if a file with the same filename is uploaded to the new
store**). Before the old store closes:

```bash
cd migration && ./download-media.sh   # downloads everything into ./media/
```

Then bulk-upload `media/` to the new store (Admin → Content → Files).
Because `shopify://shop_images/<name>` resolves by filename, same-name
uploads make all theme settings and metaobject icon references work without
editing. Product images are attached separately (URLs per product are in
`products.json`). The 6 hero/marketing videos are in the manifest as their
best MP4 rendition; re-upload and re-pick them in the customizer (video
references use store-specific GIDs).

> These downloads could not be performed from the automation sandbox (its
> egress policy blocks cdn.shopify.com) — run the script from any normal
> machine.

## 8. Theme settings that carry store-specific values

Besides the Loop IDs (§4): the favicon + logos reference `shopify://shop_images/...`
(fixed by same-name uploads); the cart-hiding custom CSS lives in Theme
settings → Custom CSS (`platform_customizations.custom_css` in
`config/settings_data.json` — carried by the theme upload); customer tags
for lead capture (`lead-capture`) are theme-block settings and carry over.

## 9. Suggested rebuild order

1. Create the new store; install **Loop**, **Judge.me**, Clarity, SparkLayer.
2. Upload media (`./download-media.sh` output) to Content → Files.
3. Create custom metaobject **definitions** (§1), then **entries** (§2).
4. Create **products** (§3) with same handles; attach images; set
   `fortified.*` metafields → metaobject entries.
5. Recreate **collections, menus, pages, policies** (§5) with same handles.
6. Recreate **selling plans + Loop bundle** (§4).
7. Upload the **theme** from this repo; set it as the preview/main theme.
8. In the customizer: re-map all Loop IDs (§4), re-add Judge.me blocks,
   re-pick the hero videos, verify favicon/logos.
9. Walk the homepage top to bottom against the old preview; test the bundle
   wizard end-to-end (plan → pouches → free creatine → checkout) and the
   lead-capture slide-over (`#leadcapture`).

## 10. What is NOT covered

- **Customers and orders** — use Shopify's store transfer/import tools if
  needed (or the lead-capture customers export from Admin).
- **Discount codes** beyond selling-plan pricing.
- **Domain / DNS, payment, shipping, tax settings** — set up in Admin.
- **Loop subscriber contracts** — migrating *active subscriptions* between
  stores is a Loop-assisted process; contact Loop support before switching.
