# Fola Adeleke — Objects theme

Shopify theme for the physical collectible (the *Mother & Child* soft vinyl
figure), rebuilt from `../shopify-theme` (the prints theme). Same visual
system — Courier, monochrome, hairlines (see `../design.md`) — but every
print-specific assumption is gone: no A1/A2/A3 sizes, no paper dimensions,
no "made to order" copy, no handle-based square-print logic.

## What's different from the prints theme

| Area | Prints theme | Objects theme |
|---|---|---|
| Variants | `Size` = A1/A2/A3, dimensions hard-coded per handle | Any options; a `Colourway`/`Colour` option renders as swatches, others as text buttons. Variant switches its image. |
| Gallery | Portrait 3:4, images only | Square stage, images + video + **3D models** (upload a GLB to the product) |
| Specs | Paper size, edition | Height (mm + in), footprint, material, weight, edition, packaging — section settings with per-product metafield overrides |
| Stock | Add to cart / Sold out | Add to cart, "Only N left", **Pre-order** (adds a `Pre-order` line property), Sold out; per-order limit |
| Info | Print shipping, made-to-order returns, size guide | In the box, details & care, boxed shipping + import duties, 14-day cancellation returns copy, age warning |
| Cart | Assumes A1/A2 | Shows option values + line properties; qty changes post automatically |
| Home | Grid of prints | Featured-figure hero (product picker, black banner) + product grid |
| Klarna | Always loads with a placeholder client ID | Loads only when the client ID is set in theme settings |

Also fixes two things broken in the prints theme: `collection.css` and
`cart.css` were referenced but never existed, and `--grey-mid` was `#999`
(fails WCAG AA) rather than the audited `#6f6f6f`.

## Product setup in Shopify admin

1. **Option**: name it `Colourway`; values start with the code, e.g.
   `C02 Sage Green`. Swatch colours come from Shopify's native option
   swatches if set, otherwise from *Theme settings → Colourways*
   (defaults: C01 `#CD6F5E`, C02 `#8A9E8A`, C03 `#C9A064`, from
   `scripts/relief/product_shots.py`).
2. **Variant images**: assign each variant its image so selecting a
   colourway switches the gallery.
3. **Inventory**: track quantity. For pre-orders, tick *Continue selling
   when out of stock* — at ≤ 0 stock the button becomes *Pre-order* and the
   pre-order note is attached to the order line.
4. **3D**: upload the figure GLB as product media (`render_figure.py` can
   export the mesh); it appears as a thumbnail marked 3D.
5. **Optional metafields** (namespace `custom`, all single-line text unless
   noted) override the section defaults per product: `subtitle`,
   `height_mm` / `width_mm` / `depth_mm` (integer), `material`,
   `figure_weight`, `edition`, `packaging`, `in_the_box` (multi-line),
   `preorder_ships`, `care` (multi-line).

## Deploy

```sh
shopify theme push --path shopify-theme-figure --unpublished
shopify theme check --path shopify-theme-figure
```

Or zip the folder's contents and upload via *Online Store → Themes → Add
theme*. If the figure is sold on the same store as the prints, don't
publish this over the prints theme — see the note in the PR / chat about
using it as an alternate product template instead.

## Defaults to confirm before launch

These are placeholders from the factory scripts, not confirmed retail specs:
height 280 mm, footprint 127 × 76 mm (target envelope in
`factory_pack.py`), box 300 × 150 × 135 mm (`product_shots.py`), material
"Soft vinyl (PVC), hand-finished", limit 2 per order, low-stock at 10.
Edition and weight are blank (hidden) until set. Shipping, returns and the
age warning are draft copy — check them against your actual courier terms
and UKCA/toy-safety position.
