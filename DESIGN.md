# Fola Adeleke® — Design System & UX Principles

A reference document for building any digital artefact for the Fola Adeleke® brand. Everything here is derived from the live codebase, not aspirational.

---

## Brand in one sentence

A London-based limited edition fine art print house. Weekly Sunday drops. No restock. Museum-grade archival paper.

---

## Colour

| Token | Hex | Usage |
|---|---|---|
| Black | `#000000` | Primary text, filled buttons, borders, brand mark |
| White | `#ffffff` | Background, reversed text on black |
| Grey Light | `#eeeeee` | Dividers, input borders (unfocused), card borders |
| Grey Mid | `#999999` | Secondary text, labels, captions, list markers |
| Grey Faint | `#cccccc` | Fine print, disabled states, scale end labels |
| Error | `#cc0000` | Form validation errors only |

The palette is strictly binary. No tints, no brand colours, no accent. If something needs to recede, use grey-mid or grey-faint. If it needs to assert, use black.

---

## Typography

**One typeface. No exceptions.**

```
font-family: 'Courier New', Courier, monospace;
font-weight: normal; /* never bold — weight is achieved through size and spacing */
```

### Type scale

| Role | Size | Letter-spacing | Transform | Colour |
|---|---|---|---|---|
| Eyebrow / kicker / label | 9–10px | 0.3–0.35em | uppercase | grey-mid |
| Fine print / footer | 9–10px | 0.08–0.2em | — | grey-faint |
| Body small | 11px | 0.08–0.12em | — | black or grey-mid |
| Body standard | 12–13px | 0.04–0.08em | — | black |
| Nav links | 11–13px | 0.2em | uppercase | black |
| Section heading | 12–13px | 0.35em | uppercase | grey-mid |
| Page title / CTA | 14–18px | 0.25–0.4em | uppercase | black |
| Hero / display | clamp(22px, 4vw, 30px) | 0.3em | uppercase | black |

Line heights: 1.6 for standard prose, 1.8–2.2 for spaced-out centred copy.

The ® mark is always superscript, set at a smaller size (10–12px), with `letter-spacing: 0`.

---

## Layout

### Content widths

| Context | Max-width |
|---|---|
| Focused / single-column content (forms, emails) | 560px |
| Editorial / press content | 780px |
| Store grid | Full bleed with 40px padding |

### Spacing rhythm

- Section padding: 40–60px top and bottom
- Content inside a section: 24–48px between blocks
- Nav height: 56px (fixed, subtracted from top padding via `padding-top: var(--nav-height)`)
- Page padding (mobile): 24px horizontal

### Grid

The nav uses a 3-column grid: `1fr auto 1fr`. The brand is centred in the `auto` column. Left and right slots hold navigation actions.

Store grids use 3 columns on desktop; stack to 1 on mobile.

Editorial metadata uses a 2-column grid: `160px 1fr` (label + value), collapsing to single column on mobile.

---

## Navigation

- Fixed top bar, 56px, white background, 1px `#eee` border-bottom
- Brand mark centred at all times
- Left: back arrow or hamburger menu
- Right: single action (contact link, or nothing)
- Mobile: slide-in drawer (240px wide, 0.3s ease transition), overlay at rgba(0,0,0,0.4)
- All nav text: 11–13px, letter-spacing 0.2em, uppercase, no decoration; underline on hover

---

## Buttons

### Primary (filled)

```css
background: #000;
color: #fff;
border: 1px solid #000;
border-radius: 0;
font-family: 'Courier New', Courier, monospace;
font-size: 11px;
letter-spacing: 0.2–0.25em;
text-transform: uppercase;
padding: 13–15px top/bottom, 36–40px left/right;
transition: opacity 0.15s; /* or invert on hover */
```

Hover: `opacity: 0.75` or invert to white fill / black text.
Disabled: `opacity: 0.4; cursor: not-allowed`.

### Secondary (outline)

Same as above but `background: #fff; color: #000`. Hover inverts to black fill.

### Inline / text link

Plain underline on hover. No colour change. No decoration at rest.

---

## Inputs

```css
border: 1px solid #eeeeee; /* default */
border: 1px solid #000;    /* focused */
border-radius: 0;
padding: 12–14px 14–16px;
font-family: 'Courier New', Courier, monospace;
font-size: 11–12px;
letter-spacing: 0.2em;
text-transform: uppercase;
outline: none;
transition: border-color 0.15s;
```

Placeholder text: grey-mid (`#999`). No floating labels. No icons inside inputs.

Textarea: same border/font rules, `resize: none`, line-height 1.9.

---

## Dividers & decorative elements

- **Section divider**: `border-top: 1px solid #eeeeee` — always full width of its container
- **Brand rule**: A 48px wide `border-top: 1px solid #000` centred under the brand name. Used as a visual full stop before the main content of a page or email.
- **List marker**: em-dash `—` in grey-mid, not a bullet. Consistent across web and email.
- **Inline separator**: `·` (middle dot), used in footers between items.
- **Pull quote**: `border-left: 1px solid #000`, 20px left padding, italic.

---

## Modals

- White background, `border: 1px solid #eee`, no border-radius
- Max-width: 420px, centred in viewport with `padding: 20px`
- Internal padding: 40px 36px 32px
- Close button: top-right, grey-mid, font-size 18px
- Overlay: `rgba(0,0,0,0.45)`
- Content: always centred

---

## Animation & interaction

Minimal. Only three transition values are used across the entire codebase:

```css
transition: opacity 0.15s;
transition: border-color 0.15s;
transition: background 0.15s, color 0.15s;
```

Drawer: `transition: left 0.3s ease`.

No scroll animations. No entrance effects. No loading spinners — buttons change text state (e.g. "Subscribing…", "Sending…").

---

## Multi-state UI pattern

Forms use an in-place state swap rather than page navigation:

1. Form visible, success div hidden (`display: none`)
2. On successful submit: hide form, show success div
3. Success state: centred, em-dash mark, short uppercase heading, 1–2 lines of grey body copy, a return link

Error state: red (`#cc0000`) text below the submit button. No toasts, no modals.

---

## Email templates

Emails follow the same design tokens but are built as table-based HTML for email client compatibility.

**Structure (top to bottom):**

1. Hidden preheader text (inbox preview snippet)
2. Header row: newsletter name left, issue number or context label right — separated by 1px `#eee` border-bottom
3. Brand mark centred (18px, letter-spacing 0.4em)
4. 48px brand rule
5. Headline (28px, letter-spacing 0.3em, uppercase)
6. Body copy (11px, letter-spacing 0.12em, line-height 2.2, centred)
7. Content sections separated by 1px `#eee` dividers
8. CTA button (black fill, same styles as web, MSO VML fallback for Outlook)
9. Signature: `— Fola`
10. Footer: brand name, copyright, unsubscribe link

**Email-specific rules:**
- Max container width: 560px
- All padding inline (no external stylesheet)
- List items use em-dash marker in a two-column table (20px marker column + content column)
- Responsive: mobile breakpoint at 620px; `mobile-padding` class adds 24px horizontal padding
- Beehiiv merge tags: `{{unsubscribe_url}}`, `{{first_name}}`, `{{subscriber.email}}`
- MSO/Outlook VML button fallback for all CTA buttons

---

## Copy voice

- Declarative and short. Sentences end, full stop.
- No exclamation marks. No hype language.
- Second person, direct: "You're in." / "You signed up before we opened the doors."
- Scarcity is factual, not pressured: "Limited pieces, no restock. Once they're gone, they're gone."
- The brand speaks with the authority of someone who doesn't need to explain themselves.

---

## Brand mark

**Web:** `Fola Adeleke®` — normal weight, Courier New, letter-spacing 0.4em, uppercase. ® is `<sup>` at ~10px, letter-spacing 0.

**Favicon:** Black 32×32px square. "FA" in Courier New, white, 13px, letter-spacing 1.5px, centred.

**Do not** use a logotype, custom typeface, or icon other than the above.

---

## What this brand is not

- No sans-serif type
- No colour other than black, white, and grey
- No rounded corners
- No drop shadows
- No gradients
- No icons or emoji
- No animations beyond the three transitions listed above
- No chatty or informal copy
- No urgency tactics ("Only 2 left!", countdown timers)
