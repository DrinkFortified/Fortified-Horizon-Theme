# Subscription creatine gift checks

Run `node --test tests/*.test.cjs` from the theme repository.
The regression suite uses the shipped JavaScript directly without adding production test exports.

## Cart contract

- Sum `quantity` only for Ajax cart lines whose normalized `product_type` is `Hydration` and whose `selling_plan_allocation.selling_plan.id` exists.
- At 3 or more qualifying units, maintain exactly one canonical gift. Below 3, remove managed gift lines.
- The gift product comes from `all_products['creatine']`. It must be available and zero-priced; no selling plan is attached.
- The canonical item properties are `_sel: ftdc-d`, `_role: creatine`, `_upsell: creatine-first-order-free`.
- Gold adds hydration once, then awaits the shared service. Gift-sync retries never re-add hydration.
- Loop continues to own renewal behavior. This change does not create or alter plans, discounts, inventory, or product prices.

## Manual Shopify preview checks

Use only the unpublished test theme and an isolated test cart.
Check both monthly and quarterly selections, exact gift copy at 3, the one-time exclusion, mixed carts, split additions, cart-drawer and cart-page removals, and mobile layout.
Verify the gift's actual cart price is zero and its selling-plan allocation is absent.
Check failure/retry handling and normal checkout gating without placing an order.

## Enforcement boundary

This is a theme-level shopping-cart rule, not a server-side authorization rule.
Direct checkout URLs, disabled JavaScript, and some app-owned accelerated checkouts can bypass theme code.
Strict prevention of bypassed free-product purchases requires Shopify-side checkout validation or an equivalent server-enforced promotion.

## Existing repository checks

The untouched test baseline at `192b36a` already fails the workflow's strict JSON parser on comments in two locale files.
Local Shopify CLI 4.8.0 Theme Check also reports 10 baseline errors.
The gift regression step runs before the existing JSON/lint steps; passing gift tests does not imply those unrelated baseline issues are resolved.
