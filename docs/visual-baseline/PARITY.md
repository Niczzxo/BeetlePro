# Migration Parity Checklist

Status key: Done means the feature is ported with the legacy DOM,
classes, CSS and behavior. Pending means not yet migrated; the
legacy file remains the only place that behavior exists.

| Feature | Legacy source location | Status | Notes |
| --- | --- | --- | --- |
| Design tokens (Stage 1) | Legacy `<style>` `:root` blocks | Done | Extracted in Phase 1 into packages/design-tokens |
| Full legacy CSS port | The single legacy `<style>` block (48,914 bytes) | Done | `apps/storefront/src/styles/legacy.css`, character-exact; imported after the tokens in globals.css |
| Product catalogue data | Legacy script: PRODUCTS, CATS, PICKS, OFFERS, ROOM, ARTICLES | Done | `apps/storefront/src/data/products.ts`; 22 products, shoes first; images decoded to `public/images/` (43 files) |
| Theme pre-paint init | Legacy `<head>` inline script | Done | Replicated byte-identical in `src/app/layout.tsx`; sets data-theme from localStorage `dostelo-theme`, light default, no system fallback |
| Header shell (Stage 2) | Legacy `<header id="topbar">` | Done | Logo image lockups (light/dark), nav, search field, icon buttons; burger menu and scrolled state ported. Burger behaviour updated to the live site fix: it opens the left mobile sidebar (#sidenav over its own #mscrim backdrop, logo header row, main nav copy, Account and Wishlist rows) instead of the old inline dropdown; see `src/components/shell/MenuSidebar.tsx`, `src/features/menu/Menu.tsx` and `src/styles/sidebar.css`. Mobile navbar synced from the live site fix after that: at max-width 860px `.hbar` is a three-zone grid (1fr auto 1fr, gap 8px) with the burger at the left edge, the logo centred (100x26px) and the four action buttons as one tight group at the right edge (36px buttons, 4px gaps); header height stays 72px so the ink snapshot alignment is unchanged, and the desktop header is untouched. The rules live with the footer redesign block in `src/styles/footer.css` (imported after legacy.css, mirroring the live file's appended block); the Header component markup is unchanged. Scroll smoothness catch-up from the live site: inside the same 860px block the topbar drops its backdrop blur on phones (`header#topbar{backdrop-filter:none}` over a near-solid 97% theme tint; desktop keeps the blurred bar), and the .scrolled scroll handler in `Header.tsx` is the live hardened one (requestAnimationFrame coalescing, class written only when the state flips, cached header ref). Panel visibility catch-up from the live site: the sidebar panel itself now carries the live delayed visibility pattern in `sidebar.css` (`.snav` hidden with the visibility flip delayed until the .45s slide out ends, `.snav.on` visible with the plain slide transition), matching the pattern its backdrop already had. Overlay scroll lock synced from the live site: while the sidebar is open, MenuSidebar sets the menu flag of `src/features/scrollLock.ts` and the root gains .scroll-locked (overflow hidden, rules at the end of `src/styles/footer.css`), so the page behind cannot scroll; the close button, backdrop click, Escape and every nav tap release it through the same menu state. Tap responsiveness synced from the live site: the global rules sit at the end of `src/styles/footer.css` (after legacy.css, as overrides), `touch-action:manipulation` on button, a, input, select, textarea, label and [role="button"] so taps no longer wait on the double-tap zoom check, and `button:active{opacity:.72}` so a press answers instantly; the more specific gesture rules are untouched (the drag tracks are plain divs carrying pan-y, the zoom photo is an img carrying none, the hero slider is a div carrying pan-y) |
| Footer shell (Stage 2) | Legacy `<footer>` | Done | Fully redesigned and synced from the live site: one always-dark footer (Warm Black #1C1B17, Off-white #F4F2ED) at every width in both site themes, styled by `src/styles/footer.css` after legacy.css. Desktop (min-width 1024px) shows six columns: Brand (dark logo lockup, italic tagline "Wear Your Style, The Dostelo Way.", description, social circles), Shop (rendered from category data, #footShop), Company, Help & Support, My Account, and the Newsletter column ("Stay in Style." envelope heading, pill form, trust mini-row under the form). Tablet (768 to 1023px) tightens the columns and moves the trust items to a full width row; mobile (max-width 767px) is an inset rounded panel (11px side margins, 26px radius, red swoosh under the tagline, cream 66x44px newsletter send segment) with centred brand and newsletter and the four link columns as one-open-at-a-time accordions (.facc-btn buttons with icons and chevrons, grid-rows animation, aria-expanded, React state in `src/components/shell/Footer.tsx`). Trust items: Fast Delivery, Secure Payment, Easy Returns, Genuine Products. Bottom bar: dynamic copyright year (#footYear), the payment logo chip row (bKash, Nagad, Rocket, Upay, Visa, Mastercard, COD chip; white chips on mobile), Privacy Policy, Terms & Conditions and Contact Us links. Newsletter behaviour is the live one: validation, 650ms loading spinner state, subscriptions stored in localStorage `dostelo-newsletter`, duplicate answered with "This email is already subscribed. You are on the list.", success reveals #newsNote and toasts "Subscribed - welcome to DOSTELO". Social links: TikTok is the real https://www.tiktok.com/@dostelo link; Instagram and Facebook keep their data-social attributes and answer with the legacy "@dostelo" toast through NavSystem. Link mapping matches the live footer: Help & Support is Delivery & Returns (data-help delivery), FAQ, Order Tracking (data-help orders), Contact Support (contact view); My Account is Login / Register, My Profile, My Orders (account view), Wishlist (#footWish, runs the header wishlist behaviour), Shopping Bag (#footBag, opens the drawer). Accordion width catch-up from the live site: at max-width 767px the link columns and accordion bodies are full width (`.fcol` and `.facc-body` gain width:100%; the desktop align-items:start no longer shrinks them to content width), and the bottom link row is one line (gap 10px, align-items center, 12px nowrap buttons with padding 0); the whole appended footer block in `footer.css` is byte-identical to the live file's |
| Theme toggle (plain switch) | Legacy applyTheme()/syncBtn() | Done | Flips data-theme, persists `dostelo-theme`, swaps aria-label and theme-color meta. Superseded as the click path by the ink-bleed port in chunk 6: applyTheme()/syncBtn() now live inside `src/features/theme/inkBleed.ts` and the toggle button is owned by that module |
| Ink-bleed theme transition | Legacy ink IIFE (WebGL2 shader, html2canvas snapshots, 2D fallback) | Done | `src/features/theme/inkBleed.ts`, a line-faithful TypeScript port of the whole legacy IIFE, wired from ThemeToggle on mount. The VERT/FRAG shader sources are byte-identical to the legacy (verified programmatically); same INK_PARAMS (1.4 s, power3.out, 0.15 s fade), RIM_COLOR, CAPTURE_BG, SPREAD and renderScale caps. Snapshots: the legacy capturePage() with its full onclone fidelity pass (theme swap, [data-ink-live] and fixed-chrome hiding, transition freeze, sticky-header stuck copy, img-to-background-div swaps, SVG paint stamping, input line-height fix), the 7 s capture cap and the fresh-pair rule (a pair bleeds only when captured in one pinned session at this layout and scroll position). Fallbacks in the legacy order and conditions: snapshots not ready yet means capture on demand and bleed when they land, with the 2.8 s wait cap answering through the 2D ink blob; no WebGL2 at all means the 2D ink blob (850 ms ragged ring in the incoming ground colour, flip at 55% cover, 220 ms dissolve); reduced motion or a lost context means the 0.45 s CSS cross-fade (the .theme-fade rules were already in the ported CSS). Hardening kept: toggleBusy guard (a waiting flip owns the tap), interrupting a running bleed freezes the current frame into a composite and re-bleeds from it, the rAF scroll guard (9 s window) plus the bleed scroll pin plus the capture scroll pin, the 20 s capture watchdog, capture-fail backoff (streak under 4), context lost/restored handling, and cleanup on every path (is-active removed, opacity 0, pins released, queued captures rescheduled). Reduced motion also blocks background captures, as in the legacy. The one mechanical difference: the legacy bundles html2canvas 1.4.1 inline as a base64 data URI with CDN retries; the port loads the same library at the same version from the npm package (html2canvas@1.4.1, exact pin) via a dynamic import on first use, keeping the loader contract (shared promise, a failed round never poisons later attempts). No animation library was added. Scroll smoothness catch-up from the live site: scheduled (background) captures now wait until the scroll has been idle for 1.2 s (a passive scroll listener stamps lastScrollStamp and scheduleCapture re-arms itself with the resize debounce while the stamp is fresh), so a capture no longer pins the page mid-scroll; theme flips are unchanged, since ensureSnapshots still calls captureAll directly on demand. Round 2 of the same live fix is now ported as well: captureAll takes a forFlip flag, background captures (captureAll(false), via scheduleCapture) never pin and never restore the scroll, a scroll generation counter lets a running background capture discard its results and re-queue when the visitor scrolls (or the tab hides) mid-render, only flip captures (captureAll(true) via ensureSnapshots) pin, and the pair only certifies fresh when a background render finished at the scroll generation it started at; capturePage also receives the capture's start scroll position (capY) for the clone's stuck header copy, exactly as on the live site. Self-heal synced from the live site: healStuckOverlays() runs before every background capture and at the head of captureAll, clearing a leftover is-active and opacity on the ink canvas and hiding a leftover 2D ink sheet, but only outside a live transition (it never touches a running flip: during a flip frame is set, and while the 2D sheet runs its rAF id is non-zero). Tap responsiveness synced from the live site: the toggle registers the first tap visibly even while snapshots are captured on demand: pointerdown sets the pending state (setTogglePending: the .is-pending class, chip background plus pulsing icon, rules at the end of `src/styles/footer.css`, and aria-busy on the button), a press that never becomes a click clears it on pointerup or pointercancel (or a 4 s safety clear), a tap while a flip is already waiting keeps the pending state and is coalesced into that one flip by the toggleBusy guard, and the pending state clears when the transition starts or the wait settles (snapshot wait timeout, fallback paths and the bleed start all clear it). Background captures are interaction-gated as well as scroll-gated: a capture-phase passive tracker on pointerdown, touchstart and keydown stamps interactions, scheduleCapture defers while an interaction is under 1.2 s old, and a running background capture checks the interaction generation at the same step boundaries as the scroll generation, discarding and re-queuing when a tap lands mid-capture so a flip capture gets priority; the fresh-pair certification now also requires an unchanged interaction generation |
| Home hero with 4-poster slider (Stage 3.1) | Legacy `.hero` markup + hero slider IIFE | Done | 4500ms crossfade, dots, pause on hover/focus/hidden, swipe with 44px threshold, drag click swallow, reduced-motion respected. Scroll smoothness catch-up from the live site: the tick also returns early while the hero sits in an .anim-off zone (the live one-line gate in `Hero.tsx`). The live .anim-off mechanism is now ported, closing the one known gap from the live scroll pass: the observer lives in `src/components/home/RevealSystem.tsx` (observes `section, .hero` with rootMargin 120px 0px, toggles .anim-off on non-intersecting zones, mounted wherever RevealSystem is mounted) and the pause rule `.anim-off .pendant,.anim-off .hot::after{animation-play-state:paused!important}` sits in `src/styles/footer.css` after legacy.css, so the hero gate is live and the pendant sway and hotspot pulse park off screen exactly as on the live site |
| Product card (Stage 3.2) | Legacy cardHTML() | Done | Hover crossfade to gallery photo via legacy CSS, Add to bag bar, badge, sold-out and low-stock states |
| Comfort product grid | Legacy renderGrid on #homeGrid (non-shoes, first 8) | Done | Same selection and order as the legacy call |
| Offer zone rail (Stage 3.2) | Legacy renderOffers() + #offerTrack | Done | Arrow scroll by track width; drag scrolling ported |
| Fresh picks rail (Stage 3.2) | Legacy PICKS render on #pickRail | Done | Arrows scroll 55% width; progress bar formula ported (25% rest to 100%) |
| Cursor drag rails + Drag badge | Legacy makeDraggable() + #dragBadge | Done | Badge lag loop, 1:1 drag, momentum glide (0.94 decay), click suppression past 8px, pointer capture; applied to offer track, picks rail, room strip |
| Scroll reveal | Legacy observeReveals()/revealSweep() | Done | Same selector, thresholds (0.3 sec-head, 0.15 else, min of element/viewport height), 450ms and 900ms safety sweeps |
| About strip + feats (home) | Legacy #about-sec markup | Done | Structural port with legacy classes and images |
| Atelier strip (home) | Legacy .atelier markup | Done | Structural port; also reused by the pending About page later |
| Shop the look | Legacy #look-sec markup + ROOM render + hotspot cards | Done | Hotspot hover cards rendered; click toggles .on selection as in legacy; the strip items navigate to the product page via NavSystem |
| Category cards (home) | Legacy catHTML() on #catGrid | Done | Shoes first, live piece counts from the catalogue |
| Reviews (home) | Legacy .review markup + starRow()/rhead regrouping | Done | Final DOM matches the legacy post-script DOM (rhead row, five stars) |
| Journal teaser (home) | Legacy jHTML() on #homeJournal | Done | Cards with the legacy transition-delay pattern |
| Search dropdown | Legacy #searchInput, #searchDrop behavior | Done | Live dropdown in the header: up to five pieces matching name or category, photo/name/price rows, the legacy empty state, Enter opens the shop with ?q=, an outside click closes it; selecting a result routes to the product page via NavSystem. Tap responsiveness catch-up from the live site: the result thumbnails in `Header.tsx` now carry decoding="async", the same spot the live fix added it |
| Wishlist behavior | Legacy toggleWish(), #wishBtn | Done | In-memory wish map in `src/features/wishlist/WishlistProvider.tsx` (the legacy stores nothing, so nothing persists); card hearts and #pdWish toggle with the .loved class and label swap, #wishCount hides at zero, the legacy saved/removed toasts fire, and #wishBtn toasts when empty or opens /shop?wish=1 showing the saved pieces snapshotted on entry under "Your wishlist" with the filter row hidden; changing the sort exits to the plain shop, as the legacy renderShop() did |
| Shop page, filters, sorting | Legacy #view-shop + renderShop() | Done | Route /shop with ?cat= and ?q= parameters; chips are All then categories in catalogue order (Shoes first), the four legacy sort options and orderings, the legacy title rule and #shopEmpty state. The wishlist retitling of this view is done (see Wishlist behavior). Tap responsiveness reviewed against the live fix and no change needed: the live deferral existed because openProduct() and renderShop() built DOM synchronously inside the tap handler; here the chip and sort handlers only set state (and router.replace), the grid is React's commit of at most 22 cards whose images are external files already loading lazy with async decoding, and nothing heavy runs inside the tap task itself, so there is no handler render to defer |
| Collections page | Legacy #view-collections + #catGrid2 | Done | Route /collections: the page head and the same catHTML() grid rendered into #catGrid2 (shared CategoryCards component with the home #catGrid). The legacy has no per-collection view or route (its router knows only #/collections, and the cards lead to the shop by category), so no /collections/[slug] was invented |
| Product detail page | Legacy #view-product, pdShow(), swatches, sizes, zoom | Done | Route /product/[id], static for all 22 products: gallery with thumbnails, pdShow() crossfade, colour variants swapping the photo and lighting the matching thumbnail, legacy size default and labels (Waist size for Pants/Jeans/Belts), quantity cap, badge/stock states, specs, related row (own category first, four pieces), hover magnifier zoom and the full-screen zoom box with click/wheel zoom and drag pan. Overlay scroll lock synced from the live site: while the zoom box is open, ProductDetail sets the zoom flag of `src/features/scrollLock.ts` and the root gains .scroll-locked, so the page behind cannot scroll; the close button, backdrop click and Escape release it through the same zbOpen state. Tap responsiveness catch-up from the live site: the main photo (#pdImg) now carries decoding="async", the same spot the live fix added it; the related row needed no deferral because it is computed in the server component (`src/app/product/[id]/page.tsx`) and renders with the page, so no tap handler builds it |
| Bag state | Legacy bag object, addToBag(), bagList() | Done | CartProvider replicates the legacy bag exactly: in-memory only (the legacy has no localStorage key for the bag), lines keyed id~size~colour, stock-capped quantities, variant photo resolution; the header bag count is live. Adds run the legacy addToBag() branching through addWithFly(): the paper plane flies and the commit, count and confirmation toast land with it; under reduced motion the bag bumps and the commit lands at once; with no source photo the commit lands and the drawer opens |
| Cart and bag drawer | Legacy #bagDrawer, renderBag(), totals() | Done | `src/components/shell/BagDrawer.tsx`: scrim and drawer with the legacy .on classes and transitions, head piece count, line items (variant photo, colour and size line, data-dq steppers, line total, Remove), the legacy empty state, footer hidden while empty, discount code row (Apply answers with the legacy "That code is not valid" toast), subtotal, delivery line and note following the renderBag() formulas, payment text row. Opened by #bagBtn and #footBag; closed by #bagClose, the scrim and Escape. The totals the drawer reads are the full legacy totals() from CartProvider, computed from the bag, the shared checkout form state (the zone the legacy detectZone() reads from the checkout fields, so the drawer quotes the zone fee once an address has been typed and reads "At checkout" before that), the signed-in account's first-order state and the admin switch. The checkout button closes the drawer and navigates to /checkout. Scroll smoothness catch-up from the live site: the closed scrims now leave the compositing tree (visibility flips to hidden once the .35s fade ends, visible again the moment they open, the live transition pattern), so their idle backdrop blur layers no longer tax scrolling; the .mscrim rule carries the pattern in `src/styles/sidebar.css`, and the shared .scrim gets it as an override at the end of `src/styles/footer.css` because its base rule sits in the frozen legacy.css. Two further live fixes are ported here: the drawer steppers (changeQty in CartProvider, the legacy [data-dq] handler) now clamp an increase at the product's stock cap (Math.max(1, stock), the same cap add() applies), where the legacy raised quantity without bound; and the drawer panel itself carries the live delayed visibility pattern as a footer.css override (.drawer hidden with the flip delayed until the .45s slide out ends, .drawer.on visible), so the closed panel leaves the rendering tree like its scrim does. Overlay scroll lock synced from the live site: the drawer and the welcome and help modals share the one scrim, so BagDrawer drives the scrim flag of `src/features/scrollLock.ts` from (bagOpen || modalOpen) and the root gains .scroll-locked while any of them is up; the three flags (scrim, menu, zoom) OR together, so overlapping overlays unlock only when the last one closes, and the gutter never shifts because legacy.css already reserves it with scrollbar-gutter:stable |
| Fly-to-bag (paper plane) | Legacy flyToBag() | Done | `src/features/cart/flyToBag.ts`, a line-faithful port: photo clone in two crease halves, pop 140ms, fold 280ms (rotateY to 82deg with the fade at 0.78), crease flash, shadow pulse, the legacy PLANE_SVG plane revealing over 200ms from 120ms before launch, 46 flight frames over 900ms on the quadratic arc (height 150, scale to 0.16, fade past t 0.94) with easing cubic-bezier(.2,.65,.35,1), the dotted trail drawn by a requestAnimationFrame sync through the legacy flyBezierY() solver, trail dropped on scroll/resize mid-flight, landing bump (380ms, gentler under reduced motion), 400ms landing ring, and the commit callback fired only at landing. Triggered from card quick-adds (NavSystem delegation, source is the card's .ph photo, suppressed after rail drags by DragSystem) and the product page Add to bag (source is #pdImg, chosen size and colour carried); sold-out products never trigger it |
| Checkout | Legacy #view-checkout, zone detection, account gate | Done | Route /checkout: the account strip (guest notice, "Ordering as name · id" with sign out, name/email prefill), delivery form in legacy order with legacy required fields, the six payment options with Cash on Delivery default, and the summary exactly as renderCheckout() (zone-named delivery label, "Free (first order offer)" / "Free - offer" / zone fee / "Enter address to calculate", first-order note row, COD charge row, total, Place order disabled on an empty bag). Zone detection is the legacy detectZone() ported character-exact (sub city regex first, English and Bangla spellings): Dhaka city 70, sub city 100, outside 150, re-detected on every keystroke in the district and address fields. Correction synced from the live site: the legacy sub city alternation missed four Bangla spellings (টঙ্গী, আশুলিয়া, ধামরাই, ডেমরা), which fell through to outside Dhaka; the regex in `src/features/checkout/detectZone.ts` now matches the live corrected one exactly, and the API's copy plus its zone tests carry the same fix. The submit is the legacy handler: signed out, it places nothing, scrolls the account card into view and toasts "An account is needed to order - sign in or create one first", bag and form intact; signed in, it mints BP- plus six digits, records the order against the account, empties the bag and swaps to the legacy confirmation view in place (order number, name, payment, address, ETA 1-2 days for Dhaka city else 2-4, item rows, total, and the COD or mobile-banking payment note) |
| Account pages | Legacy #view-account, sign in/up, admin card | Done | Route /account. The legacy keeps no account record at all: the user object ({ name, id }) is in-memory only ("this-visit demo sign-in"), so the port is a React provider with nothing persisted and a reload signs out, as in the legacy. Sign in: id trimmed, name is the part before the @ or 'Friend', id lowercased, toast "Signed in - welcome back"; the password field is required by the form and never read, as in the legacy. Sign up: the email wins over the mobile number for the id, toast "Account created - welcome to DOSTELO". The signed-in card shows the greeting, the recorded order count line (zero orders: first-order free delivery line; otherwise the returning-customer line) and Back to checkout only while the bag has pieces. The Store settings (admin) card renders only for hello@dostelo.example; its Free delivery offer switch persists dostelo-free-delivery ('1'/'0', default off) with the legacy ON/OFF toasts and refreshes the cart totals. The Your orders button keeps data-help="orders" and opens the help modal on the orders topic |
| Journal and article pages | Legacy #view-journal, #view-article, jHTML(), openArticle() | Done | Routes /journal and /journal/[slug] (static for all 3 articles): the #journalGrid cards are the shared JournalCard (the legacy jHTML(), also used by the home teaser), clicks route through NavSystem's [data-article] delegation; the article page fills the crumb, title, meta ("<cat> · <mins> min read"), hero photo and #artBody (lead as the large ink paragraph plus the stored body HTML, verbatim) exactly as openArticle() does. An unknown slug 404s instead of the legacy's fallback to the first article, as the product route already does |
| About page | Legacy #view-about | Done | Route /about: page head, split story block, the three values and this view's own atelier strip (its button reads "See the collections" and points at collections, unlike the home atelier's) |
| Contact page | Legacy #view-contact, #contactForm handler | Done | Route /contact: page head, the three contact feats and the form. The submit is the legacy handler: build the mailto to hello@dostelo.example (subject "DOSTELO enquiry", body is the message plus the sender's name), click it through a temporary anchor, then reveal #contactNote. No toast in the legacy contact flow |
| Policy and help pages | Legacy #view-shipping, #view-returns, #view-warranty, #view-faq + the FAQ accordion | Done | Routes /policies/shipping, /policies/returns, /policies/warranty, /policies/faq with the exact legacy markup and text; the FAQ accordion ports the legacy #faqList handler (one answer open at a time, clicking the open one closes it). All footer, product-page and checkout policy links (data-nav) now route here through NavSystem. Privacy and Terms have no legacy views: they exist only as help modal topics and stay that way |
| Toast | Legacy #toast + toast() | Done | `src/features/toast/Toast.tsx`: the single #toast pill, text set per call, .on class, hide timer cleared and restarted at 2400ms per call, legacy .toast CSS. All legacy call sites are now ported with their exact messages: bag add confirmation, wishlist saved/removed, empty-wishlist answer, discount code rejection, sign in/up/out, free-delivery switch ON/OFF, the account-needed order notice, the newsletter subscribe toast and the social link answers ("<name> - find us as @dostelo", through NavSystem's [data-social] delegation) |
| Welcome modal, help modal | Legacy #welcomeModal, #helpModal, HELP table, openHelp(), the welcome timer | Done | `src/features/modals/Modals.tsx`: the welcome modal with its exact markup and copy (headline "Free delivery on your first order", codetag "FIRST ORDER · FREE DELIVERY"), shown once per page load by the legacy 1400ms timer behind the in-memory welcomed flag (nothing stored, as in the legacy); #welcomeShop closes and goes to the shop. The help modal fills #helpTitle/#helpBody from the verbatim HELP table (delivery, faq, orders, checkout, privacy, terms) and opens from every [data-help] button through NavSystem (footer Help column, Privacy, Terms, the account page's Your orders). The shared #scrim lights for the modals as well as the drawer and its click runs the full legacy closeAll(), as does Escape |
| SEO noscript catalogue | Legacy `<noscript>` block in main | Done | Ported verbatim at the end of the home route's main, as in the legacy: the catalogue summary, the 14 listed pieces with prices, categories and journal titles as plain crawlable text |
| Per-view SEO metadata | Legacy SEO_PAGES + applySEO() | Done | `src/lib/seo.ts` holds the SEO_PAGES table verbatim and the applySEO() dynamic rules. Every route now carries its pair: home (layout), shop (SEO_PAGES.shop, or "<Cat> for Boys - Shop | Dostelo" for a category with no query, case-insensitive as the legacy hash match), product ("<name> - <money> | Dostelo" plus the product description), journal and article ("<title> | Dostelo Journal" plus the lead), collections, about, contact, the four policy pages, and checkout/account/confirmation from the earlier chunks. Social image fix synced from the live site: the legacy applySEO() wrote og:image and twitter:image as the IM33 data URI; the port previously emitted no og:image at all, and seoMetadata() plus the layout now carry Open Graph and Twitter blocks whose image is a real URL (SITE_URL, the port's production origin https://dostelo-one.vercel.app, plus /images/hero-1.jpg, the extracted IM33 served from the public folder), with the live og:image:alt text |

## Verification for this chunk (Phase 2, chunk 1)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm build` for @dostelo/storefront and the full workspace:
  pass; the home route prerenders as static content.
- Rendered home HTML checked for the legacy landmarks: hero slider
  with 4 posters and 4 dots, 8 comfort cards, 5 offers, 8 picks,
  8 category cards, 5 hotspots, 5 room items, 3 journal cards,
  payment chips and the drag badge.

## Verification for this chunk (Phase 2, chunk 2)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm --filter @dostelo/storefront... build` and the full
  `pnpm build`: pass; all 22 product routes prerender as static
  HTML (SSG), the shop route is server-rendered on demand
  because it reads its ?cat= and ?q= parameters.
- Landmarks checked in the rendered output: the shop renders
  the nine filter chips in legacy order (All, Shoes, Shirts,
  T-Shirts, Polo, Pants, Jeans, Belts, Accessories), 22 cards
  unfiltered and 8 for Shoes, the titles "Shop all", "Shoes"
  and "Results for ..." follow the legacy rule, and the empty
  state appears for a query with no matches. The shoe page
  (Court White Sneakers) shows both variant swatches with
  "Colour - White", the second size (EU 40) selected, the
  compare-at price and "Add to bag" with the price; the
  clothing page (Essential Crew-Neck T-Shirt) shows
  "Colour - Black" and "Size - M". Jeans and belts read
  "Waist size -", the cap reads "Size - One size", the wallet
  shows its low-stock line, the sold-out graphic tee shows the
  sold-out stock line and a disabled Sold out button, related
  rows carry four cards, and the zoom box markup is present.
- The legacy file is untouched at 10,743,999 bytes, and no
  em dashes appear in any file written for this chunk.

## Verification for this chunk (Phase 2, chunk 3)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm --filter @dostelo/storefront... build` and the full
  `pnpm build`: pass; routes unchanged (home static, all 22
  product routes SSG, shop server-rendered on demand).
- Landmarks checked in the prerendered home HTML: the bag
  drawer shell is present in the page (scrim, #bagDrawer,
  #bagItems with the legacy empty state, #bagHeadCount,
  #bagClose) with the footer hidden while empty, the delivery
  line reading "At checkout", the total at the taka zero, the
  default delivery note, and the #toast pill with role="status",
  matching the legacy initial renderBag() output. The client
  bundle carries the fly-to-bag pieces (flyer-paper, flyer-trail,
  flyer-ring, flyer-crease, the PLANE_SVG path, the reduced
  motion guard) and the exact toast messages for the bag add
  confirmation, wishlist saved/removed, the empty-wishlist
  answer and the discount code rejection, plus the shop's
  "Your wishlist" title.
- The legacy file is untouched at 10,743,999 bytes, and no
  em dashes appear in any file written for this chunk.
- Honest deviations: none in behavior. Two structural notes:
  the wishlist grid is a snapshot taken when the shop view
  mounts in wishlist mode (the legacy renders it once in the
  #wishBtn handler), and the drawer's totals read zone and
  first-order state as unset until the checkout and account
  chunks supply them, which reproduces the legacy drawer's
  signed-out, no-address state exactly.

## Verification for this chunk (Phase 2, chunk 4)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm --filter @dostelo/storefront... build` and the full
  `pnpm build`: pass; /account and /checkout prerender as
  static routes alongside home, the 22 product routes and the
  shop.
- Business rules exercised in node against the compiled ported
  modules (features/checkout/detectZone.ts,
  features/cart/totals.ts, features/account/orders.ts), 16 of
  16 checks passing: Mirpur in Dhaka gives zone dhaka and a
  620 total on the 550 taka tee (550 + 70); Savar gives subcity
  and 650 (the sub city match wins over the plain Dhaka match,
  including when the district field says Dhaka); Sylhet gives
  outside and 700, and Sylhet plus Cash on Delivery totals 710
  (the COD 10 as its own fee); Bangla spellings detect Dhaka,
  Gazipur, Savar, Narayanganj and Keraniganj; an empty address
  leaves the zone pending and an empty bag charges no zone or
  COD fee; a signed-out visitor has no first-order free; a new
  account's first order is delivery-free with the COD 10 still
  applied (550 + 10 = 560); after recordAccountOrder the same
  account is charged the zone rate on its second order; a
  different account on the same browser still has its own free
  first order; the admin switch overrides for everyone with COD
  still applied; recording an order writes
  dostelo-orders-by-account and removes the dead
  dostelo-first-order-used and dostelo-social-free keys.
- The zone regexes in the port were diffed against the legacy
  source and are byte-identical, Bangla alternatives included.
- Landmarks checked in the prerendered HTML: /checkout renders
  the account card with the guest notice and the hidden
  "Ordering as" block, all six form fields with their legacy
  ids, the six payment options (Cash on Delivery first), the
  summary rows with coDel reading "-" and the label "Delivery"
  in the empty-bag state (the legacy renderCheckout() output
  for an empty bag; "Enter address to calculate" ships in the
  client bundle for the bag-with-items state), and Place order
  disabled. /account renders both forms (sign-up hidden), the
  tabs, the signed-in and admin cards hidden, and the device
  note. The client bundles carry the exact legacy strings for
  the account gate toast, sign in/up/out, the free-delivery
  ON/OFF toasts and the BP- order prefix. The home drawer still
  reads "At checkout" before any address exists.
- The legacy file is untouched at 10,743,999 bytes, and no
  em dashes appear in any file written for this chunk.
- Honest deviations: the legacy confirmation is a separate
  hash view; here it renders in place at /checkout after an
  order is placed (the same view swap, without a route of its
  own), and its data is the snapshot taken at submit, as the
  legacy fills the confirmation DOM before emptying the bag.
  The account prefill of the checkout name/email runs when the
  signed-in account changes, where the legacy re-runs it on
  every renderCheckout(); the visible result is the same
  because the legacy only ever fills empty fields. The Your
  orders button on the account page is inert until the help
  modal lands, as noted in its row.

## Verification for this chunk (Phase 2, chunk 5)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm --filter @dostelo/storefront... build` and the full
  `pnpm build`: pass; the new routes prerender as static HTML
  (/collections, /about, /contact, /journal, all 3 article
  routes and all 4 policy routes as SSG), alongside home, the
  22 product routes, /account and /checkout; the shop stays
  server-rendered on demand.
- Landmarks checked in the prerendered HTML: the journal list
  renders #journalGrid with all three article cards carrying
  data-article; the fabric-care article renders the crumb,
  title, the meta line "Care · 5 min read", #artImg and
  #artBody with the lead paragraph and body sections; each
  policy page renders its view id, headings and full text
  (the shipping page through "please keep your phone
  reachable on the delivery day") with its SEO_PAGES title;
  the contact page renders #contactForm and #contactNote;
  the collections page renders #catGrid2 with the category
  cards; the about page renders its values and atelier strip;
  and the home shell carries the welcome modal markup
  (headline, codetag, #welcomeShop) and the help modal shell
  (#helpTitle, #helpBody), plus the noscript catalogue.
- Metadata rules exercised against the production server:
  /shop answers the SEO_PAGES.shop title, /shop?cat=Shoes and
  /shop?cat=shoes answer "Shoes for Boys - Shop | Dostelo"
  (the legacy dynamic rule, case-insensitive), /shop?q=tee
  falls back to SEO_PAGES.shop, a product page answers
  "<name> - <money> | Dostelo", and an article answers
  "<title> | Dostelo Journal".
- The legacy image bytes for the welcome modal and the about
  view were hash-matched to the decoded files in
  public/images/ (offer-up-to-30-off-shirts.jpg and
  workshop-tailor.webp), so the ports reference the same
  photos the legacy embeds.
- The Your orders button on the account page is live now: it
  opens the help modal on the orders topic (in chunk 4 it was
  inert, as recorded there).
- The legacy file is untouched at 10,743,999 bytes, and no
  em dashes appear in any file written for this chunk.
- Honest deviations: the legacy collections view is a single
  category-grid page, so /collections is a single route and
  no /collections/[slug] product grid was invented; the
  legacy article view's unknown-id fallback (first article)
  is a 404 here, matching the product route's earlier call;
  the one shared #scrim is rendered by the bag drawer and
  driven by both the drawer and modal state, which reproduces
  the legacy's single-scrim closeAll() without duplicating
  the id. The only rows left Pending are the ink-bleed theme
  transition and the final full parity/regression pass
  (chunk 6).

## Verification for this chunk (Phase 2, chunk 6)

- `pnpm typecheck` across the workspace: 5 of 5 tasks pass.
- `pnpm --filter @dostelo/storefront... build` and the full
  `pnpm build`: pass; routes unchanged (home static, all 22
  product routes SSG, shop server-rendered on demand).
- The shader sources in `src/features/theme/inkBleed.ts` were
  diffed programmatically against the legacy file: VERT_SRC
  (153 bytes) and FRAG_SRC (4,900 bytes) are byte-identical.
- Built output checked: the layout chunk carries the ink
  system (#version 300 es, fbm5, uTendril, the capture timeout
  and failure strings, ink-capturing, theme-fade, dostelo-theme);
  html2canvas ships as its own async chunk, loaded on first
  capture; the prerendered home HTML carries the #inkCanvas
  overlay element; the built CSS contains all 8 legacy
  keyframes (sway, fadeRise, dropIn, slideIn, lineUp, viewIn,
  nw-search-in, hotPulse).
- Final parity audit, run against the legacy file: all 15
  legacy views map to routes (home, shop, product, collections,
  journal, article, about, contact, checkout, confirmation in
  place at /checkout, account, shipping, returns, warranty,
  faq); all localStorage keys are accounted for (dostelo-theme,
  dostelo-free-delivery, dostelo-orders-by-account in use; the
  dead dostelo-first-order-used and dostelo-social-free keys
  purged exactly where the legacy purges them); all 7 literal
  legacy toast strings and every constructed toast fragment
  (bag add with variant, wishlist saved/removed, free-delivery
  ON/OFF, the @dostelo social answer) are present in the port;
  the only data-theme setters in the app are the pre-paint init
  script and the ink module, as in the legacy.
- The legacy file is untouched at 10,743,999 bytes, and no
  em dashes appear in any file written for this chunk.

## Phase 2 completion

The public storefront migration is complete. Every row in the
checklist above is Done: the exact legacy CSS and design
tokens, the shell (header, footer, bag drawer, navigation),
the home page with its hero slider, rails, drag system and
reveals, the shop with filters, sorting, search and wishlist,
all 22 product pages with variants and zoom, the bag with the
paper-plane fly-to-bag, checkout with zone detection and the
account gate, the account pages with the admin free-delivery
switch, the journal and article pages, the about, contact and
policy pages, the modals and toasts, the per-view SEO metadata
and noscript catalogue, and the ink-bleed theme transition
with its 2D and CSS fallbacks.

Remaining honest gap: the side-by-side visual regression pass
against the live site (screenshots at 1440, 768 and 390 px,
mid-animation frames included, as listed in BASELINE.md) has
not been run. It needs both sites served and a visual check,
which this environment cannot do; it stays open as the one
verification step still owed before the legacy implementation
is retired anywhere. Nothing else is pending.

Closure note, 2026-11-26: that pass has now been run for home,
shop, product and checkout in the light theme. See the Visual
regression pass section at the end of this file and
REGRESSION-2026-11-26.md in this folder.

## Phase 5 addition: visitor tracker and consent notice

The storefront tracker (apps/storefront/src/features/tracking/)
and its consent notice are architecture additions from the
full-stack pack (Buyer Intelligence), not legacy features, and
they are recorded here so the parity claim stays exact. The
tracker renders nothing except the one-time consent notice,
uses only the existing design tokens and legacy CSS variables
for that notice (no new colours, no new stylesheet), and does
not alter any legacy layout, class or behaviour: the cart,
checkout and navigation code paths are unchanged, and tracking
sends are fire-and-forget so an unreachable API cannot affect
the store. The new localStorage and sessionStorage keys
(dostelo-visitor-id, dostelo-session-id, dostelo-consent) are
additions alongside the legacy keys accounted for above.
Details live in apps/storefront/README.md.

## Phase 6 addition: recovery link page

The /recover/[token] route
(apps/storefront/src/components/recover/) is an architecture
addition from the full-stack pack (Abandoned Cart Recovery),
not a legacy feature, recorded here so the parity claim stays
exact. The legacy site has no recovery links. The page reads
the API's public token view (items at current catalogue
prices, no contact details), adds the saved lines into the
existing local bag through the unchanged CartProvider on the
visitor's action, and answers recovered, closed, cancelled,
expired and unknown tokens with an honest message. It uses
only the legacy page-head, button and CSS variable language
(no new colours, no new stylesheet, no legacy layout or
behaviour changed) and is excluded from search indexing
because the link is personal. Details live in
apps/storefront/README.md.

## Visual regression pass (2026-11-26)

The side by side pass owed since Phase 2 was run on
2026-11-26 with the user's approval to launch the locally
downloaded headless Chrome. Scope: light theme only (the user
decided on 2026-11-26 to remove the dark theme from the
storefront, so dark captures and toggle states were dropped).
Pages: home, shop, product (sneakers-court) and checkout.
Viewports: 1440, 768 and 390.

The legacy reference was the exact live build, served locally
from the bytes niczzxo.github.io served that night (MD5
17be281c20ad69dc7dbac016def15130), because headless Chrome
cannot traverse this machine's authenticated egress proxy.
The preserved legacy file was used in a first round and
superseded: it predates the footer redesign, which the port
follows, so its heights differ by a constant footer delta.

Result: match on all four pages at all three viewports. Page
heights are identical in every pair (home 6843 / 10741 /
10103, shop 3277 / 5856 / 4613, product 2190 / 3181 / 3628,
checkout 2294 / 2879 / 3770). No real visual defects were
found. The only differences are documented capture artifacts
(hero poster rotation timing, lazy image paint timing, a
Chrome full page sticky header seam on two port shop shots)
and the known Phase 5 consent notice, which was declined
before capture. Full method, per page verdicts and artifact
evidence: REGRESSION-2026-11-26.md in this folder, with the
24 screenshots under shots/.

Coverage limit: the remaining BASELINE.md routes (account,
journal, article, collections, contact, policy pages) and
interaction states were not captured in this pass, so legacy
retirement for those still rests on the chunk verifications
above.
