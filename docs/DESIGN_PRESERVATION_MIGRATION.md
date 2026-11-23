# Design Preservation and Migration Contract

## Absolute requirement

The current Dostelo public theme, color system, animation behavior, layout, typography, responsive behavior and assets must remain visually and functionally equivalent after migration to Next.js + React + TypeScript.

The original `apps/storefront/public/legacy/index.html` is the reference source.

## Source-specific observations

The original HTML:
- Starts with `<html lang="en" data-theme="light">`.
- Sets light theme before first paint unless localStorage contains a saved valid `light` or `dark` value under `dostelo-theme`.
- Defines light/dark custom properties including `--bg`, `--panel`, `--surface`, `--surface2`, `--ink`, `--body`, `--muted`, `--line`, `--dark`, `--dark2`, `--on-dark`, `--on-dark-mut`, `--chip`, `--shadow`, and radius variables.
- Contains CSS keyframes `sway`, `fadeRise`, `dropIn`, `slideIn`, `lineUp`, `viewIn`, `nw-search-in`, and `hotPulse`.
- Includes behavior for ink-bleed transition, fly-to-bag, scroll reveal, carousel/rail, image zoom, theme switching, and toast/modal interactions.

The exact numeric color values, keyframe declarations, timing, easing, responsive breakpoints and JS behavior must be copied from the original source. Do not replace these with guessed values.

## Migration order

### Stage 0: Freeze a visual baseline
- Keep original source and assets untouched.
- Capture screenshots at agreed desktop/tablet/mobile viewport sizes.
- Record all routes and interaction states.
- Create a feature checklist and screen recording for complex motion effects.

### Stage 1: Design tokens
- Extract original CSS custom properties exactly into `packages/design-tokens`.
- Preserve `data-theme` behavior and `dostelo-theme` persistence.
- Import tokens into storefront global styles.
- Use shared brand tokens in admin where relevant; admin can have a separate layout density and neutral data surfaces.

### Stage 2: Shared shell
- Port header, navigation, footer and search.
- Preserve DOM semantics, CSS classes where practical, and animation trigger sequence.
- Compare screenshots before moving to the next feature.

### Stage 3: Feature-by-feature migration
1. Home and hero
2. Product card and collection rails
3. Shop, filters and sorting
4. Product detail, variants and image zoom
5. Cart and fly-to-bag effect
6. Wishlist
7. Checkout
8. Account and orders
9. Journal, contact and policies
10. Theme transition, reveal and remaining effects

### Stage 4: Remove legacy implementation only after parity
For every feature:
- Visual comparison at same viewport.
- Interaction comparison.
- Keyboard and accessibility check.
- Reduced-motion check.
- Mobile check.
- Performance check.
- Automated Playwright regression test.

Do not delete the legacy source until all routes and interactions pass.

## Acceptance criteria

- Same color values and light/dark behavior.
- Same font family/weights and typography scale.
- Same image assets, crop, placement and responsive behavior.
- Same section order, widths, spacing, borders, shadows and radii.
- Same animation keyframes/easing/duration/delay/trigger sequence.
- Same ink-bleed and fly-to-bag behavior.
- No broken routes, cart, wishlist, search, zoom, carousel or theme persistence.
- No material visual regression on mobile or desktop.

## Admin visual relationship

Admin must look like Dostelo: use shared brand typography, logo, color tokens and component language. However, admin is an operations tool. It should use a compact sidebar, tables, filters, forms, status indicators and accessible data visualizations. Do not copy the public site's shopping hero or high-motion interactions into admin pages.
