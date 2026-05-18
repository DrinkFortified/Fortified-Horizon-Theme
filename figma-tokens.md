# FORTIFIED Design Tokens

> Source: Figma file `v5mQNpxn2DXVu8k3Ny6aZW` (page node `52:2` — DESKTOP + MOBILE FINAL)
> Live Figma MCP extraction failed (API overload / no active selection in desktop app), so values fall back to `DESIGN_SPEC.md` per task instructions. Where ambiguity exists, the CSS includes `/* fallback: DESIGN_SPEC */` comments so future runs can refine.

## Colors

| Token | Hex | Use |
|---|---|---|
| `--fortified-teal` | `#00B8B8` | Primary CTA, eyebrow text, marquee, header |
| `--fortified-teal-dark` | `#009A9A` | Hover state |
| `--fortified-black` | `#0A0A0A` | Dark section backgrounds |
| `--fortified-dark` | `#111111` | Dark card backgrounds |
| `--fortified-white` | `#FFFFFF` | Text on dark, light surfaces |
| `--fortified-off-white` | `#F7F7F7` | Light section backgrounds |
| `--fortified-gray-light` | `#EBEBEB` | Borders, dividers |
| `--fortified-gray-mid` | `#999999` | Secondary text |
| `--fortified-orange` | `#E8821A` | Salty Orange product accent |
| `--fortified-purple` | `#7B3FA0` | Energy product accent |
| `--fortified-gold` | `#D4A017` | Everyday Hydration accent |
| `--fortified-success` | `#2ECC71` | Checks, success badges |

## Typography

| Token | Stack |
|---|---|
| `--font-fortified-display` | `"Bebas Neue", "Anton", "Impact", sans-serif` |
| `--font-fortified-body` | `"DM Sans", "Inter", system-ui, sans-serif` |

Loaded via Google Fonts in `layout/theme.liquid`:
- Bebas Neue (display / headlines, ALL CAPS, 0.95 line-height)
- DM Sans (400/500/600/700) — body, buttons, eyebrows, nav

### Scale (clamp-based, fluid)

| Element | Size |
|---|---|
| H1 | `clamp(40px, 7vw, 72px)` |
| H2 | `clamp(32px, 5vw, 56px)` |
| H3 | `clamp(24px, 3vw, 36px)` |
| Body | `clamp(15px, 1.1vw, 17px)` |
| Eyebrow | `clamp(11px, 1vw, 13px)`, weight 600, letter-spacing 0.15em |
| Button | `clamp(12px, 1vw, 14px)`, weight 700, letter-spacing 0.10em |

## Spacing

| Token | Value |
|---|---|
| `--fortified-container` | `1280px` |
| Container padding | `clamp(16px, 4vw, 80px)` |
| `--fortified-section-py` | `clamp(48px, 8vw, 120px)` |
| Gap small | `12px` |
| Gap medium | `24px` |
| Gap large | `48px` |
| Gap XL | `80px` |

## Border Radius

| Token | Value | Use |
|---|---|---|
| Small | `6px` | Inputs |
| Medium | `12px` | Cards |
| Large | `20px` | Hero panels |
| `--fortified-radius-pill` | `100px` | All buttons |

## Color Schemes

This theme leverages Horizon's existing color scheme system. The FORTIFIED sections expose `color_scheme` settings that target three primary schemes:

- `scheme-1` — Light surfaces (white bg / black text) — default for hero, press, stats, ingredients
- `scheme-2` — Dark surfaces (black bg / white text) — used for dark-lifestyle, subscribe-save, flavors-cta
- `scheme-3` — Teal accent (teal bg / white text) — used for announcement bar, header, marquee strips

Configure scheme color values from the theme editor under "Colors". Defaults can be set in `config/settings_data.json`.

## Components

### Buttons
Pill (radius 100px), 14px 32px padding, uppercase 0.10em letter-spacing.
- `.fortified-btn--primary` teal background, white text
- `.fortified-btn--ghost` transparent + teal border
- `.fortified-btn--dark` black background
- `.fortified-btn--white` white background (for use on dark sections)

### Eyebrow Label
Uppercase teal text, 11–13px, letter-spacing 0.15em, weight 600.

### Checklist Item
`✓` icon (teal) + body text, 10px gap.

### Badge
Pill chip, 6px 14px padding, uppercase 11px weight 700, 0.12em letter-spacing.
Variants: teal, dark, white.

## Breakpoints

| Name | px |
|---|---|
| Mobile | 375 |
| Mobile L | 480 |
| Tablet | 750–768 |
| Desktop S | 1024 |
| Desktop | 1280 |
| Desktop L | 1440 |

Mobile-first. Nav collapses to hamburger below 768px. Hero stacks below 750px.
