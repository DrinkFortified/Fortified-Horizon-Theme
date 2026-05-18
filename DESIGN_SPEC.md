# FORTIFIED — Design Specification
> Extracted from Figma screenshots: Homepage, PDP, Landing Page
> For use with Claude Code Shopify Horizon theme build

---

## Brand Identity

- **Brand name:** FORTIFIED
- **Tagline patterns:** "THE TRUTH", "FORMULATED FOR", "YOUR BEST DAY"
- **Voice:** Science-backed, athletic, direct, confident
- **Products:** Hydration electrolyte powder sticks (Everyday Hydration, Energy)
- **SKUs:** Electrolytes 03+K3, Energy Hydration Stick – Salty Orange K2, Energy Hydration Stick – Salty Palau K2
- **Key claims:** 1200MG Sodium, Sugar-free, Zero crash, Clinically backed ingredients, Magnesium Glycinate

---

## Color Palette

```css
:root {
  /* Primary */
  --color-teal:        #00B8B8;   /* Nav bar, marquee bar, hero accents, CTA buttons */
  --color-teal-dark:   #009A9A;   /* Hover states */

  /* Neutrals */
  --color-black:       #0A0A0A;   /* Dark section backgrounds */
  --color-dark:        #111111;   /* Dark card backgrounds */
  --color-white:       #FFFFFF;
  --color-off-white:   #F7F7F7;   /* Light section backgrounds */
  --color-gray-light:  #EBEBEB;   /* Borders, dividers */
  --color-gray-mid:    #999999;   /* Secondary text */

  /* Product packaging accents */
  --color-orange:      #E8821A;   /* Salty Orange product accent */
  --color-purple:      #7B3FA0;   /* Energy/purple product accent */
  --color-gold:        #D4A017;   /* Everyday Hydration bag accent */

  /* Functional */
  --color-success:     #2ECC71;   /* Checkmarks, badges */
  --color-text-primary: #0A0A0A;
  --color-text-inverse: #FFFFFF;
  --color-eyebrow:     #00B8B8;   /* "THE TRUTH", "FORMULATED FOR" labels */
}
```

---

## Typography

```css
/* Display / Headlines */
--font-display: 'Bebas Neue', 'Anton', sans-serif;
/* Used for: "HYDRATION THAT HITS", "YOUR BEST DAY", "WHY WE BEAT THE REST" */
/* Style: ALL CAPS, ultra-bold, tight tracking */

/* Body / UI */
--font-body: 'DM Sans', 'Inter', sans-serif;
/* Used for: body copy, buttons, labels, nav */

/* Eyebrow labels */
/* Style: small caps or uppercase, letter-spacing: 0.15em, color: var(--color-teal), font-size: 11-13px */
```

### Type Scale
| Element | Size | Weight | Transform |
|---|---|---|---|
| Hero H1 | 56–72px desktop / 36–48px mobile | 900 | uppercase |
| Section H2 | 40–52px desktop / 28–36px mobile | 800 | uppercase |
| Eyebrow label | 11–13px | 600 | uppercase, tracked |
| Body | 15–17px | 400 | none |
| Button | 13–15px | 700 | uppercase, tracked |
| Stat number | 36–48px | 900 | uppercase |

---

## Spacing & Layout

```css
--container-max: 1280px;
--container-padding: clamp(16px, 4vw, 80px);
--section-padding-y: clamp(48px, 8vw, 120px);
--gap-sm: 12px;
--gap-md: 24px;
--gap-lg: 48px;
--gap-xl: 80px;
--border-radius-sm: 6px;
--border-radius-md: 12px;
--border-radius-lg: 20px;
--border-radius-pill: 100px;
```

---

## Navigation

### Announcement / Marquee Bar
- Background: `var(--color-teal)`
- Text: white, uppercase, 11px, letter-spacing 0.15em
- Content scrolling ticker: "SCIENCE BASED · NO SUGAR · ZERO SUGAR · CLEAN INGREDIENTS · SCIENCE BASED · NO SUGAR · STRESS ·"
- Height: ~36px

### Main Header
- Background: `var(--color-teal)`
- Logo: "FORTIFIED" wordmark, white, left-aligned
- Nav links: SHOP · BUNDLES · ABOUT — white, uppercase, 13px
- Right: ACCOUNT + cart icon — white
- Sticky on scroll

---

## Buttons

```css
/* Primary CTA */
.btn-primary {
  background: var(--color-teal);
  color: white;
  border-radius: var(--border-radius-pill);
  padding: 14px 32px;
  font: 700 13px var(--font-body);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* Secondary / Ghost */
.btn-secondary {
  background: transparent;
  color: var(--color-teal);
  border: 2px solid var(--color-teal);
  border-radius: var(--border-radius-pill);
  padding: 12px 28px;
}

/* Dark CTA (used on dark sections) */
.btn-dark {
  background: white;
  color: var(--color-black);
  border-radius: var(--border-radius-pill);
}

/* Add to Cart */
.btn-atc {
  background: var(--color-teal);
  color: white;
  width: 100%;
  border-radius: var(--border-radius-pill);
  padding: 18px;
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
}
```

---

## Page-by-Page Section Inventory

---

### HOMEPAGE

#### Section 1 — Hero
- Full-width, split layout (text left / image right on desktop; stacked on mobile)
- Background: teal gradient or image
- Eyebrow: "FORMULATED FOR" (teal, small caps)
- H1: "HYDRATION THAT HITS"
- Body: short 1–2 line descriptor
- CTAs: "SHOP NOW" (primary) + "LEARN MORE" (ghost)
- Image: woman holding FORTIFIED product, teal background

#### Section 2 — Press Logos Bar
- White background
- Logos: Marie Claire · Men's Health · GQ · Mail Online · Esquire
- Horizontal row, center-aligned, grayscale logos
- Padding: ~48px vertical

#### Section 3 — Product Feature ("Clean Hydration Max Performance")
- Eyebrow: "FORMULATED FOR"
- H2: "CLEAN HYDRATION MAX PERFORMANCE"
- Body: short descriptor
- Large product imagery (multiple bags displayed side by side)
- CTA: "EXPLORE ALL FLAVORS"

#### Section 4 — Dark Lifestyle ("More Than Hydration")
- Background: `var(--color-black)`
- Eyebrow: "THE TRUTH" (teal)
- H2: "MORE THAN HYDRATION / ITS DAILY SUPPORT"
- Grid of 4–5 lifestyle/athletic photos
- Benefit badges with + prefix: +ENERGY · +PERFORMANCE · +HYDRATION · +FOCUS
- CTA: "EXPLORE ALL FLAVORS" (white button)

#### Section 5 — Stats ("Why We Beat The Rest")
- White/light background
- H2: "WHY WE BEAT THE REST ELECTROLYTES"
- 3 stat boxes:
  - "2.3x Better Hydration" with bar chart graphic
  - "+24% Improved Endurance" with bar chart graphic
  - "0% No Sugar. No Crash." with checklist
- Checklist items: Visually Improve Hydration, Improve Hydration, Support Muscle Function
- CTA: "EXPLORE ALL FLAVORS"

#### Section 6 — Ingredients Comparison (Tabbed)
- Eyebrow: "THE TRUTH"
- H2: "WHY WE BEAT THE REST ELECTROLYTES"
- Tabs: HYDRATION | PERFORMANCE
- 4 ingredient rows: each shows ingredient image (powder), name (Sodium Citrate), description, dosage badge (1200MG), "Hydration Facts" badge
- CTA: "SHOP FORTIFIED NOW"

#### Section 7 — Lifestyle Photo Strip
- Eyebrow: "THE TRUTH"
- H2: "MORE THAN HYDRATION ITS DAILY SUPPORT"
- Horizontal strip of 5 lifestyle photos (scrollable on mobile)
- CTA: "SHOP FORTIFIED NOW"

#### Section 8 — FAQ
- Split layout: left = "FREQUENTLY ASKED QUESTIONS" + "READ ALL REVIEW" button; right = accordion questions
- Questions: What are Timeline and Ptospar?, Why is it Important?, Who should take it?, What is the recommended dosage?, Why is it Important?, Who should take it?
- Accordion: expand/collapse

#### Section 9 — B2B Split ("Become a Wholesaler / Partner")
- Two side-by-side cards
- Left: "BECOME A WHOLESALER" — dark bg, image, CTA "SUBSCRIBE NOW"
- Right: "BECOME A PARTNER" — dark bg, product image, CTA "SUBSCRIBE NOW"
- Eyebrow on each: "THE TRUTH"

#### Section 10 — Subscribe & Save
- Dark background (`var(--color-black)`)
- H2: "SUBSCRIBE & SAVE 15%"
- Benefits list (checkmarks): Improve Hydration · Boost Energy Naturally · Support Muscle Function
- CTA: "SUBSCRIBE NOW"
- Background: lifestyle/product photography

#### Footer
- Multi-column layout
- Logo + brand description (left)
- SHOP column: Collections, Products, Bundles, Sale
- LEARN column: Science, About, Tag
- JOIN NEWSLETTER: email input + submit
- Social icons: Instagram, TikTok (bottom left)
- Copyright line
- Legal links: Terms of Service, Privacy Policy

---

### PDP (Product Detail Page)

#### Section 1 — Product Hero
- Product images carousel (left ~55% width on desktop)
- Right panel:
  - Product title: "EVERYDAY HYDRATION"
  - Subhead: "YOUR BEST DAY"
  - Star rating + review count (Judge.me badge here)
  - Flavor/variant selector with product image thumbnails (e.g. Electrolytes 03+K3)
  - Purchase option toggle:
    - "1 Pouch / Daily Meals" — $12.99
    - "3 Pouches / Daily 3 Months" — $62.93 (highlighted/selected state)
  - Promo code expandable
  - Quantity selector
  - Loop Subscriptions widget (between variant selector and ATC button)
  - "ADD TO CART" button (full width, teal, pill)

#### Section 2 — Upsell Block ("Add Creatine")
- Directly below ATC, above trust badges
- FORTIFIED branded creatine product image
- "ADD CREATINE" label
- Pricing: ONE TIME PURCHASE $59.00
- CTA: "ADD CREATINE TO CART"
- Background: warm/orange-tinted

#### Section 3 — Trust Badges Row
- 5 badges horizontally: LOOPS · DROPS · DROPS · DROPS · DROPS
- Loop badge prominent (first)

#### Section 4 — Brand Story ("Formulated For Your Best Day")
- Dark background with athlete image
- Eyebrow: "FORMULATED FOR"
- H2: "YOUR BEST DAY"
- CTA: "EXPLORE ALL FLAVORS"

#### Section 5 — Clinically Backed Ingredients
- White background
- H2: "CLINICALLY BACKED INGREDIENTS"
- Description paragraph
- Ingredient list with check icons
- CTA: "SHOP FOR YOUR GOAL"

#### Section 6 — Testimonial (Alex Friedman)
- Photo of Alex Friedman (Pro Climber)
- Name + title
- Quote: "I feel the difference in my workouts and recovery. No more cramps."
- CTA: "SHOP FOR YOUR GOAL"

#### Section 7 — Stats Row
- 3 stats: "Over 18" · "500+" · "95.6%"
- Labels below each number

#### Section 8 — Flavors CTA ("Fuel Your Every Move")
- Dark section
- H2: "FUEL YOUR EVERY MOVE"
- CTA: "EXPLORE ALL FLAVORS"

#### Section 9 — Comparison Table
- H2: "WHY WE BEAT THE REST ELECTROLYTES"
- FORTIFIED vs Liquid IV (×3 columns)
- Rows: Sodium per serving, Sugar-free, Energy version, Real fruit flavor, Magnesium glycinate, Trial price
- FORTIFIED values highlighted (teal column header or checkmark emphasis)

#### Section 10 — Lifestyle Photos ("More Than Hydration")
- Same as Homepage Section 4/7 pattern

#### Section 11 — Reviews (Judge.me)
- H2: "12,400+ CUSTOMER REVIEWS"
- Review cards: 4–5 per row, star rating, reviewer name, "Game changer!" headline, body text
- CTAs: "READ ALL REVIEW" + "WRITE A REVIEW"
- Judge.me carousel widget

#### Section 12 — FAQ
- Same pattern as Homepage FAQ

#### Section 13 — Subscribe & Save
- Same as Homepage Section 10

---

### LANDING PAGE

#### Section 1 — Hero ("Try 3 Sticks For FREE")
- Teal/cyan gradient background
- H1: "TRY 3 STICKS FOR FREE*"
- Benefits list: Premium Hydration + Performance · Zero Sugar, Zero Crash · Scientifically Dosed Ingredients
- CTA: "TRY 3 STICKS FOR $1.99" (pill button, dark)
- Product images: 3 sticks (Salty Orange + Energy) floating/overlapping
- Asterisk disclaimer text below button

#### Section 2 — Ingredient Stats Bar
- Dark bar below hero
- Stats inline: 1200MG Sodium · 200MG Mag Cit · 150MG Potassium · 100MG Calcium · 300MG per cap
- White text on dark background

#### Section 3 — Social Proof ("12,400+ Customer Reviews")
- Eyebrow: "THE TRUTH"
- H2: "12,400+ CUSTOMER REVIEWS"
- 4 review cards in a row (same style as PDP reviews)
- All show "Game changer!" headline, star rating, Sarah J. reviewer

#### Section 4 — Featured Product Card
- Split layout: left = product image with "Doctor Recommended" badge + "4.8 stars / 4.6k reviews"; right = product details panel
- Right panel:
  - "BESTSELLER" badge
  - Product: "EVERYDAY HYDRATION"
  - Prices: $1.99 sale / $9.97 regular
  - Checklist: Energy Hydration Stick – Salty Orange K2, Energy Hydration Stick – Salty Palau K2, Free USA Shipping, Money-Back Guarantee
  - CTA: "SHOW FORTIFIED"
  - Trust line: "Fast shipping within US (under 1 to 4 hours)"

#### Section 5 — Dark Benefits ("Why We Beat The Rest")
- Dark background, full-width athlete image
- H2: "WHY WE BEAT THE REST ELECTROLYTES"
- Day-by-day benefit icons: Day 1-3 columns × 5 (Formulate & trial schedule)
- CTA: "EXPLORE ALL FLAVORS"

#### Section 6 — Ingredients Grid
- H2: "WHY WE BEAT THE REST ELECTROLYTES"
- 4 ingredient cards, 2×2 grid: Sodium Citrate (×4 shown) with image + description + "HYDRATEIN" badge
- CTA: "SHOW FORTIFIED"

#### Section 7 — Comparison Table
- Same structure as PDP comparison table
- FORTIFIED vs Liquid IV (×3)
- Trial price row prominent: $1.99 vs $8.97 vs $5.97 vs $5.97
- CTA: "SHOP FORTIFIED NOW"

#### Section 8 — Product + Benefits ("Formulated For Your Best Day")
- Split: left = benefits list + ATC button; right = lifestyle product photo
- Benefits: Improve Hydration · Boost Energy Naturally · Support Muscle Function · Reduce Fatigue · Gut Friendly Formula
- CTA: "ADD TO CART – $28.98"

#### Section 9 — FAQ
- Same accordion pattern

#### Section 10 — Subscribe & Save
- Dark background
- H2: "SUBSCRIBE & SAVE 15%"
- Same benefits + CTA pattern

---

## Component Patterns

### Eyebrow Label
```html
<p class="eyebrow">THE TRUTH</p>
<!-- style: uppercase, teal, 11px, letter-spacing 0.15em, font-weight 600 -->
```

### Badge
```html
<span class="badge badge--teal">BESTSELLER</span>
<span class="badge badge--dark">DOCTOR RECOMMENDED</span>
```

### Stat Block
```html
<div class="stat-block">
  <span class="stat-number">2.3x</span>
  <span class="stat-label">Better Hydration</span>
</div>
```

### Benefit Checklist Item
```html
<li class="benefit-item">
  <span class="check-icon">✓</span>
  <span>Improve Hydration</span>
</li>
```

### Review Card
```html
<div class="review-card">
  <div class="stars">★★★★★</div>
  <h4>Game changer!</h4>
  <p>Body copy text...</p>
  <span class="reviewer">Sarah J. — Verified Buyer</span>
</div>
```

---

## Third-Party Integrations

### Loop Subscriptions
- Script: `https://cdn.loopwork.co/loop.js`
- Placement: PDP, between variant selector and ATC button
- Block settings: subscription_discount_percentage (range 5–30%), subscribe_label, one_time_label
- Widget trigger: `data-loop` attributes on product form

### Judge.me Reviews
- Snippet: `{% render 'judgeme_widgets', widget_type: 'judgeme_review_widget', concierge_install: true, product: product %}`
- Star badge: inline near product title on PDP
- Full review block: PDP + Landing Page "12,400+ Customer Reviews" section
- Carousel widget available for homepage use

---

## Responsive Breakpoints

| Name | Width |
|---|---|
| Mobile | 375px |
| Mobile L | 480px |
| Tablet | 768px |
| Desktop S | 1024px |
| Desktop | 1280px |
| Desktop L | 1440px |

- Mobile-first approach
- Navigation collapses to hamburger at <768px
- Product grid: 1 col mobile → 2 col tablet → 3–4 col desktop
- Hero: stacked on mobile, split on desktop
- Photo strips: horizontal scroll on mobile, full row on desktop

---

## Assets & Images
- All product bag images available via Shopify CDN (assign via section settings, not hardcoded)
- Lifestyle photography: dark athletic/wellness theme
- Ingredient photography: white powder/crystal close-ups on dark backgrounds
- Press logos: Marie Claire, Men's Health, GQ, Mail Online, Esquire (SVG preferred)
- All images: use native `loading="lazy"` + Shopify `image_url` filter for responsive sizing

---
*End of DESIGN_SPEC.md*
