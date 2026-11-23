# Visual Baseline (Stage 0)

The visual baseline for the storefront migration is the preserved
legacy implementation itself:

- Reference source: `apps/storefront/public/legacy/index.html`
  (10,743,999 bytes, never edited) with its assets in
  `apps/storefront/public/legacy/assets/`.
- The legacy file is the source of truth for colors, typography,
  layout, spacing, images, animations and behavior. Every migrated
  feature is compared against it at the same viewport before it is
  marked done in `PARITY.md`.

## Viewports to capture

| Viewport | Width x height | Notes |
| --- | --- | --- |
| Desktop | 1440 x 900 | Primary comparison size |
| Tablet | 768 x 1024 | Legacy breakpoint behavior |
| Mobile | 390 x 844 | Legacy breakpoint at 860px and below applies |

Capture each viewport in both themes (light default, dark via the
navbar toggle with `dostelo-theme` persisted).

## Routes and states to capture

For the legacy file, views are hash routes inside the single page;
for the migrated app they become real routes as each lands.

- Home (`/` legacy view-home): hero poster 1 settled, hero poster
  mid-crossfade, hero dots state, comfort grid, offer zone, fresh
  picks rail at rest and scrolled, shop the look with a hotspot
  hover card open, category cards, reviews, journal teaser, footer
  with the payment chip row.
- Home interactions: product card hover (second photo crossfade,
  Add to bag bar raised), rail drag with the Drag badge visible,
  scroll reveal mid-animation and settled, theme toggle before and
  after (ink bleed is pending, see PARITY.md).
- Shop (`/shop`, pending): filter row, sort states, empty state.
- Product detail (`/product/[slug]`, pending): gallery, variant
  swatch selected, hover zoom, quantity, related products.
- Cart drawer and checkout (pending): bag items, zone delivery
  totals, account gate, payment options.
- Account, journal, article, collections, contact and policy pages
  (pending).

## Method

1. Serve the legacy file and the migrated app side by side.
2. Capture the same route, viewport, theme and interaction state in
   both, following the checklist above.
3. Compare against the acceptance criteria in
   `docs/DESIGN_PRESERVATION_MIGRATION.md`: same color values, type
   scale, section order, spacing, radii, shadows, keyframes, easing
   and trigger sequence.
4. Record the outcome per feature in `PARITY.md`. A feature is only
   marked done when its comparison passes at all three viewports.
