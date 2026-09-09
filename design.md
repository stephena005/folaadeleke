# Fola Adeleke® — Design System

This document captures the design principles and visual language of the Fola
Adeleke website (folaadeleke.com), for use as reference when designing new
pages, emails, product assets, or Claude Projects work for this brand. Use it
to keep new work indistinguishable in tone and craft from the existing site.

> **The site and the emails have diverged — deliberately.**
> In September 2026 the email system was rebuilt around legibility: body
> copy moved off Courier, and every colour was re-measured against WCAG
> AA. The website has **not** yet followed. Where this document
> describes the two differently that is a record of fact, not an
> inconsistency to tidy away. See §9 for the email system;
> `newsletter-template.html` is authoritative there and this document
> defers to it.

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

### Known accessibility debt

`--grey-mid` is used for body copy and secondary text across the site,
and it does not meet WCAG AA (4.5:1 for normal text). Measured:

| Colour | On | Ratio | Verdict |
|---|---|---|---|
| `#999999` | white | **2.85:1** | fails |
| `#cccccc` | white | **1.61:1** | fails badly |

They remain documented because the site genuinely still uses them.
**Do not carry them into new work.** The email rebuild replaced them
with the scale below, and the site should follow when there is time —
the "faint" complaint that triggered the email redesign applies to the
site for exactly the same reason.

### Accessible greys — use these for anything new

| Role | Hex | On | Ratio |
|---|---|---|---|
| Body ink | `#111111` | white | 18.9:1 |
| Secondary | `#4f4f4f` | white | 8.2:1 |
| Label | `#6f6f6f` | white | 5.0:1 |
| Footer ink | `#666666` | `#f2f0ed` | 5.1:1 |
| Reversed body | `#c9c9c9` | black | 12.7:1 |
| Reversed label | `#9a9a9a` | black | 7.5:1 |
| Hairline | `#dcdcdc` | white | structure only, never text |

Always measure a grey against the background it actually sits on, not
against white. `#6f6f6f` passes on white at 5.0:1 but reaches only
4.42:1 on the `#f2f0ed` footer ground — which is why the footer uses
`#666666`.

## 3. Typography

One typeface, used for literally everything — headings, body, buttons, forms,
labels:

```
font-family: 'Courier New', Courier, monospace;
```

This is intentional: a monospace, typewriter-like face gives the site its
catalogue/dossier feel. Do not substitute a grotesk or serif; do not add a
second display face.

**Email is the one deliberate exception.** There, Courier carries the
wordmark, labels, headlines, captions, numerals and buttons — the brand
furniture — while body copy is set in Helvetica/Arial at 16px/1.65.
Mono has thin, uniform strokes; at 11px with wide tracking the eye stops
grouping letters into words, and the email reads faint no matter how
much white space surrounds it. That was the central fault in the
pre-2026 templates. The rule below about small sizes and loose tracking
describes the **site**; do not apply it to email body copy.

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

## 9. Email system

`newsletter-template.html` at the repo root is the authoritative
template and carries the full spec in its own header comment. Copy it
to `newsletter-issue-0NN.html`, fill the `[PLACEHOLDERS]` (square
brackets, so they can never be confused with Beehiiv's
`{{merge_tags}}`), delete blocks marked OPTIONAL, repeat those marked
REPEATABLE. This section is the summary; the template wins on any
disagreement.

**Type**

| Role | Face | Size | Tracking |
|---|---|---|---|
| Wordmark | Courier | 13px | 0.26em |
| Section label | Courier | 11px | 0.30em |
| Headline | Courier | 34px (26px mobile) | 0.16em |
| Sub-headline | Courier | 20px | 0.14em |
| Caption / numerals | Courier | 10–12px | 0.10–0.18em |
| Button | Courier | 13px | 0.18em |
| **Body copy** | **Helvetica/Arial** | **16px / 1.65** | — |

**Structure**

Preheader (write it as a real sentence — it is the second thing read),
header with wordmark left and issue label right, full-bleed hero with a
caption bar, headline and intro, repeatable numbered items, at most
**one** inverted black band, optional 3-up tile row, `— Fola`, footer
on `#f2f0ed`.

**Rules**

- 560px card on a `#faf9f7` ground; 32px side padding, 24px mobile
- Spacing on an 8px rhythm — 32 and 40 between sections. White space is
  not the same as air: faint text in a large gap reads as emptiness,
  not elegance
- Multi-column rows use **percentage widths, never fixed px**. Fixed
  columns distribute unevenly across images of differing aspect and the
  row ends up ragged with misaligned captions
- All padding inline; responsive breakpoint at 620px
- MSO/Outlook VML fallback on every CTA button
- **No web fonts.** Helvetica, Arial, Courier New and Georgia ship with
  every mail client; a Google Font silently falls back in Outlook and
  the Gmail app and breaks the rhythm

**Images**

Hero 1120px wide; 2-up tiles 720x900; 3-up tiles 480x600 — one shared
aspect ratio per row or the captions will not line up. Export
full-bleed from the masters in `images/prints/`. Never letterbox
artwork on white, and never point an email or a web page at a print
master — they run to 50 MB and beyond.

Every image must be **deployed before the send**. Email clients have no
site to be relative to, so all `src` values are absolute URLs and an
undeployed file is a broken box in the inbox.

**Dark work at small sizes.** Most pieces in the catalogue are more
than 85% near-black. Before putting one in a 3-up row, check it still
reads at 92px — what that row gets on a phone. If it does not, give it
a larger slot or pick a more graphic piece.

**Campaign emails** must not leak the answer or the mechanic in an
asset path, filename or alt text. Serve crops from a neutral directory.
A time-boxed offer must state its **real** deadline: if the landing
page enforces a fixed end instant, saying "24 hours" tells a late
opener they have longer than they do.

## 10. Applying This System

When designing something new for Fola Adeleke (a page, email, product
graphic, or social asset), check it against this list:

1. Is it black, white, or a grey-on-white/grey-on-black variant only?
2. Is the typeface Courier New/monospace, with hierarchy coming from
   letter-spacing and uppercase rather than new fonts or heavy weights?
   (Email is the exception — body copy there is Helvetica/Arial; see §9.)
3. Are corners sharp (0 radius) except for genuinely circular/pill controls?
4. Is depth expressed with hairline borders and flat contrast, not shadows
   or gradients?
5. Do hover/transition effects stay subtle (opacity, transform, ~0.15–0.3s)
   rather than flashy?
6. Does copy stay terse, uppercase for labels, sentence-case and short for
   body text?
7. Does every piece of text clear WCAG AA (4.5:1) against the background
   it actually sits on — not against white?

If a new element fails more than one of these, it's off-brand — simplify it
back toward the system rather than adding a one-off exception.
