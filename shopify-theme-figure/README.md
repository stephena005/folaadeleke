# Fola Adeleke — Objects theme

Shopify theme for the physical collectible (the *Mama Comfort* soft vinyl
figure), rebuilt from `../shopify-theme` (the prints theme). Same visual
system — Courier, monochrome, hairlines (see `../design.md`) — but every
print-specific assumption is gone: no A1/A2/A3 sizes, no paper dimensions,
no "made to order" copy, no handle-based square-print logic.

## What's different from the prints theme

| Area | Prints theme | Objects theme |
|---|---|---|
| Colourways | `Size` = A1/A2/A3, dimensions hard-coded per handle | Colourways as **separate products** (originally `mama-comfort-terracotta` / `-sage-green` / `-sand`; now Black & Gold only, so no swatches show) render as linked swatches; a `Colourway` variant option also works and switches the image |
| Gallery | Portrait 3:4, images only | Square stage, images + video + **3D models** (upload a GLB to the product) |
| Specs | Paper size, edition | Edition, dimensions (H × W × D), material, signature, packaging, certificate — copy taken from `products/mama-comfort/` |
| Stock | Add to cart / Sold out | **Pre-order** (with the four pre-order terms above the button and an "est. dispatch" line property), "Only N of 20 left", Sold out; per-order limit |
| Info | Print shipping, made-to-order returns, size guide | Details & care, boxed shipping + import duties, pre-order/14-day cancellation returns copy, 14+ warning, "pre-production renders" note |
| Cart | Assumes A1/A2 | Shows option values + line properties; qty changes post automatically |
| Home | Grid of prints | Featured-figure hero (product picker, black banner) + product grid |
| Klarna | Always loads with a placeholder client ID | Loads only when the client ID is set in theme settings |

Also fixes two things broken in the prints theme: `collection.css` and
`cart.css` were referenced but never existed, and `--grey-mid` was `#999`
(fails WCAG AA) rather than the audited `#6f6f6f`.

## Product setup in Shopify admin

1. **Colourways** (one product per colourway). Mama Comfort is now Black
   & Gold only: `mama-comfort-black-gold` is the one live product, and
   Terracotta / Sand / Sage Green are archived, so the picker hides itself (it needs two
   or more published products). If colourways return, put the
   products in one collection (e.g. `mama-comfort`) and pick it in
   *Product page → Colourway collection*, or set a `custom.colourways`
   product-list metafield. Swatch colours come from a `custom.swatch`
   colour metafield if set, else *Theme settings → Colourways*, matched on
   the handle (`…-terracotta` → `#CD6F5E`, `…-sage-green` → `#8A9E8A`,
   `…-sand` → `#C9A064`). The swatch label is `custom.colourway`, else
   the title after " — ".
   *Alternative*: one product with a `Colourway` option — values like
   `C02 Sage Green` — also works; variant images switch the gallery.
2. **Pre-order**: tag each product `pre-order` and track inventory at the
   edition size (20). The button reads *Pre-order*, the terms box shows,
   and "Pre-order, est. dispatch January 2027" is added to the order line.
   Remove the tag at dispatch. (Selling past zero with *Continue selling
   when out of stock* is also treated as pre-order.)
3. **3D**: upload the figure GLB as product media; it appears as a
   thumbnail marked 3D.
4. **Per-product overrides** (metafields, namespace `custom`, single-line
   text unless noted): `subtitle`, `edition`, `edition_size` (integer),
   `height_mm` / `width_mm` / `depth_mm` (integer), `material`,
   `figure_weight`, `signature`, `packaging`, `certificate`, `in_the_box`
   (multi-line), `dispatch_estimate`, `image_note`, `care` (multi-line).

## Deploy — live setup (prints and figure on one store)

`shop.folaadeleke.com` sells prints and Mama Comfort, and a store has one
live theme, so the figure page ships **inside the prints theme** as an
alternate product template. Don't publish this standalone theme over it.

Files in `../shopify-theme/`:

- `templates/product.figure.json` → `sections/main-product-figure.liquid`
  (this folder's product section, with swatch colours as a section setting)
- `assets/figure-product.css`
- `snippets/figure-swatch-colour.liquid`, `figure-colourway-label.liquid`,
  `figure-colour-option-check.liquid`
- The prints cart no longer labels figures "A1 — 594 × 841 mm" and shows the
  pre-order line property; grid buttons read "View" for figures.

Steps:

1. Push the theme: `shopify theme push --path shopify-theme --theme <live theme id> --only templates/product.figure.json --only sections/main-product-figure.liquid --only assets/figure-product.css --only "snippets/figure-*" --only sections/main-cart.liquid --only sections/main-collection.liquid --only sections/main-index.liquid`
   (or paste the files into *Edit code*).
2. On each Mama Comfort product, set *Theme template* to `product.figure`.
3. In the theme editor, open a Mama Comfort product and pick the colourway
   collection; check the limit (3 per order) and dispatch estimate.

This standalone folder stays as the full theme in case the figure moves to
its own store; keep both copies of the product section in step.

## Defaults to check

Spec and terms copy is lifted from `products/mama-comfort/index.html`
(Oct 2026): Black & Gold (C04) only, edition of 20, 280 × 127 × 76 mm, soft vinyl
(PVC), dispatch January 2027. If any of that changes, update the section
settings in the theme editor (or the metafields) as well as the page.
Theme-only assumptions to confirm: limit 3 per order, "Only N of 20 left"
from 10 remaining, and the returns/shipping wording against your courier
terms.
