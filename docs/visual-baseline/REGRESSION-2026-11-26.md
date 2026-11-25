# Visual Regression Pass, 2026-11-26

Scope: light theme only, by the user's decision of 2026-11-26
00:11 +06 to remove the dark theme from the storefront. All dark
theme captures and theme toggle states were dropped from this
pass. Pages compared: home, shop, product (Court White
Sneakers, sneakers-court) and checkout. Viewports: 1440 x 900,
768 x 1024 and 390 x 844, as listed in BASELINE.md.

## Setup

- Browser: the locally downloaded headless Chrome 157 driven by
  Puppeteer from ~/workspace/dostelo-visual-check/, run with the
  user's explicit approval of 2026-11-26 00:01 +06.
- Legacy side: headless Chrome cannot reach
  https://niczzxo.github.io/Dostelo/ from this machine (the
  authenticated egress proxy refuses Chrome's CONNECT tunnel,
  net::ERR_TUNNEL_CONNECTION_FAILED, while curl works). The
  legacy reference was therefore served locally from the exact
  bytes the live site served on the same night, downloaded with
  curl: 5,389,203 bytes, MD5 17be281c20ad69dc7dbac016def15130,
  with the repo assets folder for its assets/demo-* files. A
  first round used the preserved file
  apps/storefront/public/legacy/index.html instead and was
  superseded: that file predates the footer redesign and the
  later live fixes, so its footer is the old three column
  footer, and every page height differed from the port by a
  constant per viewport (31 px at 1440, 293 px at 768, 265 px
  at 390), entirely explained by that footer.
- Port side: production build of apps/storefront from the
  current main state (including the legal wiring), served with
  next start on localhost:3100, NEXT_PUBLIC_API_URL pointing at
  the live Railway API.
- Capture method: full page screenshots, scrollbars hidden,
  rendered widths 1425, 753 and 375 px. Before each capture the
  welcome modal was closed through its own close button and the
  port's privacy consent notice was declined; the page was then
  scrolled through in steps to trigger scroll reveals and lazy
  images and returned to the top. The final shop captures (all
  viewports) and product captures (1440) were re-taken with an
  explicit wait for every image to finish loading. Animations
  were not disabled; the hero slider was left running (see
  artifact 1).
- Comparison method: page heights measured in the browser, a
  band by band pixel difference (200 px bands, mean absolute
  difference) over the screenshot pairs, and direct visual
  inspection of every flagged band as side by side crops.
- Screenshots: docs/visual-baseline/shots/, named
  <page>-<legacy|port>-<width>.png, 24 files.

## Results

Page heights in pixels, legacy live build vs port. Every pair
is identical.

| Page | 1440 | 768 | 390 |
| --- | --- | --- | --- |
| Home | 6843 = 6843 | 10741 = 10741 | 10103 = 10103 |
| Shop | 3277 = 3277 | 5856 = 5856 | 4613 = 4613 |
| Product | 2190 = 2190 | 3181 = 3181 | 3628 = 3628 |
| Checkout | 2294 = 2294 | 2879 = 2879 | 3770 = 3770 |

Verdicts:

- Home 1440: match. One band at the top differs at noise level
  (mean 7.7 of 255); inspected directly, header, headline, hero
  poster, mini cards and section order are identical.
- Home 768: match, with artifact 2 recorded below (one category
  tile photo unpainted on the legacy side).
- Home 390: match, with artifact 1 recorded below (hero poster
  rotation).
- Shop 1440, 768, 390: match. After the image complete
  re-capture, no band differs above noise at 1440, and only
  sub-noise bands remain at 768 and 390 (see artifact 3).
- Product 1440, 768, 390: match. No band differs above noise
  at 1440 and 768; one negligible band (mean 2.3) at 390.
- Checkout 1440, 768, 390: match. No band differs above the
  noise threshold at any viewport. The account gate card,
  delivery form, payment options and order summary render
  identically, including the empty bag state.

No real visual defects were found on any compared page at any
viewport: no layout, spacing, colour, typography, text or image
differences that survive a settled capture.

## Capture artifacts (not defects)

1. Hero poster rotation (home). The 4 poster slider rotates
   every 4.5 seconds, so pairs can catch different posters. At
   390 the legacy capture shows poster 4 (Shirts & Tees,
   Everyday essentials from 550) and the port shows poster 2
   (First Order Offer, Free delivery on your first order). The
   surrounding layout, dot state style and typography are
   identical, and both posters exist in both implementations.
2. Lazy image paint timing. In intermediate captures,
   individual card or tile photos were still blank on one side
   or the other: the port shop at 1440 (jeans and belts row),
   the legacy product page at 1440 (two related product
   photos), the legacy shop at 768 (belts, cap and wallet
   photos), and the legacy home at 768 (the Jeans category
   tile, still unpainted in the saved home-legacy-768.png).
   A separate probe that waited for every image to complete
   showed all images loaded on both sides (port shop: 43
   images, 0 broken). The only image with naturalWidth 0 on
   either product page is the empty src flyer placeholder,
   present in both implementations. The final shop and product
   captures waited for image completion and show no blanks.
3. Sticky header seam in full page captures (port shop at 768
   and 390). The port screenshots show the sticky header
   composited a second time across the first product row, a
   known Chrome full page capture artifact at a segment seam.
   A live scroll probe proved the behaviour identical: on both
   sides the header is position sticky with the body as its
   parent (parent height 5856 px on shop at 768, header height
   73 px), and after scrolling 2000 px its rect sits at top 0
   on both sides.
4. One legacy home capture at 768 exceeded the 90 second
   network idle timeout (the legacy ink system keeps the page
   busy); the capture still completed and its height matches
   the port exactly.

## Known intentional difference

The port shows the Phase 5 privacy consent notice on a first
visit (the Your privacy card with Accept marketing use and
Decline). The legacy has no such notice. It was declined
before every capture. This is the documented Phase 5 addition
recorded in PARITY.md, not a regression.

## Coverage limits and verdict on legacy retirement

This pass covers the four pages above at the three baseline
viewports in the light theme, in their settled states. It does
not cover the other routes listed in BASELINE.md (account,
journal, article, collections, contact and the policy pages)
or interaction states (card hover crossfade, rail drag badge,
bag drawer open, zoom box). For the four compared pages, the
port is now verified against the live legacy build. Retiring
the legacy implementation entirely should either wait for the
same treatment of the remaining routes or be accepted by the
user with this coverage stated.
