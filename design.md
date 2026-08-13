# Fola Adeleke® — Design System

This document captures the design principles and visual language of the Fola
Adeleke website (folaadeleke.com), for use as reference when designing new
pages, emails, product assets, or Claude Projects work for this brand. Use it
to keep new work indistinguishable in tone and craft from the existing site.

## 1. Design Philosophy

The site reads like a **gallery catalogue crossed with a terminal** —
monochrome, typewritten, deliberate. Every visual decision reinforces three
ideas:

- **Restraint.** Pure black and white, one typeface, no decoration for
  decoration's sake. The art is the only thing allowed to have color or
  texture; the interface stays out of its way.
- **Precision.** Sharp corners, hairline borders, tight grids, uppercase
  labels tracked out like museum wall text. Nothing is rounded or soft unless
  it's a literal circular control (play button, dot).
- **Quiet confidence.** Small type, generous whitespace, slow/subtle
  transitions. The brand doesn't shout — it lets the imagery and the ® do the
  talking.

If in doubt, default to *less* — fewer colors, fewer weights, fewer effects.

## 2. Color Palette

Strictly monochrome. No accent colors anywhere in the product UI.

| Token | Value | Usage |
|---|---|---|
| `--black` | `#000000` | Primary text, buttons, borders, hero/section backgrounds |
| `--white` | `#ffffff` | Page background, inverted text on black |
| `--grey-light` | `#eeeeee` | Hairline dividers, subtle borders |
| `--grey-mid` | `#999999` | Secondary/muted text, placeholders, inactive labels |
| `--grey-bg` | `#000000` | Media placeholder background (hero, product images) |

Overlays use black at low opacity rather than a new color:
`rgba(0,0,0,0.4)` (drawer scrim), `rgba(0,0,0,0.45)` (modal scrim),
`rgba(0,0,0,0.92)` (lightbox scrim). White at low opacity is used the same
way on dark sections (`rgba(255,255,255,0.3–0.6)`).

**Never** introduce brand colors, gradients, or tinted greys — if a new
section needs emphasis, use black/white inversion (a full-bleed black
section with white text) instead of color.

## 3. Typography

One typeface, used for literally everything — headings, body, buttons, forms,
labels:

```
font-family: 'Courier New', Courier, monospace;
```

This is intentional: a monospace, typewriter-like face gives the site its
catalogue/dossier feel. Do not substitute a grotesk or serif; do not add a
second display face.

**Type scale and treatment:**

- Weight is almost always `normal` (400). A single `font-weight: 200` shows
  up once for an oversized display heading — weight is not used as a lever
  otherwise.
- **Letter-spacing is the primary tool for hierarchy and tone**, not size.
  Labels, nav items, buttons, and eyebrows are tracked out heavily:
  - Micro-labels / eyebrows: `0.3em`–`0.4em`, uppercase, tiny (9–10px)
  - Nav, buttons, product labels: `0.2em` (the shared `--spacing` token), uppercase
  - Body copy / paragraphs: `0.05em`–`0.1em`, sentence case, `color: grey-mid`
  - Large display numerals (e.g. countdown): tight/negative tracking (`-0.02em`) since size alone carries weight there
- **Uppercase** is used for all interactive and structural labels (nav,
  buttons, section eyebrows, product names, form placeholders). Body
  sentences and descriptive copy stay in normal case.
- Font sizes are small and restrained: most UI text sits between **9px and
  14px**. Large type is reserved for hero headings and countdown numerals,
  and even then uses `clamp()` to stay responsive rather than jumping to a
  conventional "hero" size.
- Line-height on body copy is loose — `1.8`–`1.9` — to keep the small
  monospace type readable and give it that letterpress-notes rhythm.

## 4. Layout & Structure

- **Sharp edges everywhere.** `border-radius: 0` is the default on every
  button, input, card, and container. The only rounded elements are
  literally circular controls (a 50%-radius play button, a status dot) or
  the floating "pill" music widget (`border-radius: 24px`) — rounding is
  reserved for small, physical-feeling controls, never for cards or panels.
- **Hairline borders**, 1px, in black or `--grey-light`, used to separate
  sections (footer top border, nav bottom border) and to outline inputs/
  buttons rather than using shadows.
- **No box-shadows, no gradients.** Depth comes from flat color contrast
  (black-on-white sections) and borders, not elevation effects.
- Grids are simple and CSS-Grid based: a 3-column product grid on desktop
  collapsing to 2 columns on tablet and 1 on mobile, with generous `gap`
  (24–40px). The nav uses a 3-column `1fr auto 1fr` grid to keep the brand
  mark perfectly centered regardless of what's in the side slots.
- Fixed top nav, 56px tall, white background, hairline bottom border,
  hamburger-triggered slide-in drawer (not a horizontal menu) for navigation
  — this holds even on desktop, reinforcing the minimal/uncluttered header.
- Full-bleed, high-contrast media sections: hero and countdown sections go
  edge-to-edge in solid black with centered content, functioning as visual
  "chapter breaks" between white catalogue sections.

## 5. Components

- **Buttons** (`.btn-primary`, countdown email button, etc.): solid black
  fill, white text, no border, no radius, uppercase tracked label, and the
  *only* hover feedback is an opacity dip (`opacity: 0.75–0.8` on hover,
  `transition: opacity 0.15s`). No color shift, no scale, no shadow.
- **Inputs**: transparent or white background, 1px solid border (black, or
  white-on-black for dark sections), no radius, uppercase tracked
  placeholder text, no focus glow — `outline: none` with the border doing
  the work.
- **Cards** (product cards): image first (4:3, `object-fit: cover`), then a
  tight info stack — name (uppercase, tracked), size/edition (muted grey),
  price. No card border or shadow; whitespace alone separates cards in the
  grid.
- **Modals**: centered, white, thin border, generous internal padding
  (40/36/32px), uppercase tracked `<h2>`, muted grey body copy, full-width
  black CTA button at the bottom.
- **Drawer / mobile nav**: slides in from the left (`left: -260px → 0`,
  `transition: left 0.3s ease`), full-height, white with a right hairline
  border, links stacked with hairline dividers between them, uppercase
  tracked labels, nested submenus expand via `max-height` transition with a
  rotating caret.
- **Floating music widget**: a small circular play/pause button
  (bottom-right, fixed) that reveals a pill-shaped label on hover/active
  state via opacity + translateX — the one place the site allows a soft,
  playful micro-interaction (a pulsing ring animation while "playing").
  It's a good reference for how to add *one* small delightful detail without
  breaking the otherwise austere system.
- **Lightbox**: near-black scrim (`rgba(0,0,0,0.92)`), image only, minimal
  close affordance top-right — treats artwork viewing like a gallery
  blackout room.

## 6. Motion

Motion is subtle, fast, and functional — never decorative:

- Page-to-page transitions: opacity + 6px translateY fade-in (`fadeIn 0.25s ease`).
- Hover states: opacity changes only (`0.15s`), no scale/color animation on
  buttons.
- A dedicated page loader (propeller-spin icon) enforces a **minimum show
  time (~1.8s)** even on fast loads, and cross-fades (`~600ms`) between
  pages — this is a deliberate pacing choice, not a spinner-until-ready
  pattern.
- Drawer and modal transitions use simple property transitions
  (`left`, `max-height`, `opacity`) with easing, never spring/bounce curves.

## 7. Imagery

- Photography/artwork is presented full-bleed and uncropped-feeling
  (`object-fit: cover` for heroes/hero media, `object-fit: contain` in the
  lightbox so nothing is cropped when a piece is actually being studied).
- Media containers default to a **black background** while loading/empty,
  so missing or loading imagery never shows as a jarring white gap.
- No filters, duotones, or color treatments are applied — images are shown
  as-shot; the black/white restraint lives in the UI chrome around them, not
  in the imagery itself.

## 8. Voice & Content Conventions

- The brand name is always written **"Fola Adeleke®"** with the registered
  trademark symbol in nav/footer/brand contexts.
- Copy is short and declarative: eyebrow labels like "STAY IN THE LOOP",
  "ALMOST THERE.", "FOLA ADELEKE'S NOTES" — terse, uppercase, tracked.
  Supporting body lines are lowercase/sentence-case and brief (one short
  sentence or two, e.g. "First access to every drop. Studio updates. Direct
  from Fola.").
- Primary navigation is intentionally small: **Home, Products (Prints,
  World), Artist, Press, Contact** — resist adding more top-level items;
  nest anything new under an existing group where possible.
- Footer is minimal: social links (Instagram, TikTok) + a single copyright
  line, muted grey, tiny type.

## 9. Applying This System

When designing something new for Fola Adeleke (a page, email, product
graphic, or social asset), check it against this list:

1. Is it black, white, or a grey-on-white/grey-on-black variant only?
2. Is the typeface Courier New/monospace, with hierarchy coming from
   letter-spacing and uppercase rather than new fonts or heavy weights?
3. Are corners sharp (0 radius) except for genuinely circular/pill controls?
4. Is depth expressed with hairline borders and flat contrast, not shadows
   or gradients?
5. Do hover/transition effects stay subtle (opacity, transform, ~0.15–0.3s)
   rather than flashy?
6. Does copy stay terse, uppercase for labels, sentence-case and short for
   body text?

If a new element fails more than one of these, it's off-brand — simplify it
back toward the system rather than adding a one-off exception.
