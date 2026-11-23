# Public Storefront: Responsibilities and Flow

## Routes

| Route | Purpose |
|---|---|
| `/` | Home |
| `/shop` | Product listing |
| `/category/[slug]` | Category listing |
| `/product/[slug]` | Product detail |
| `/collections/[slug]` | Curated collections |
| `/cart` | Shopping cart |
| `/checkout` | Checkout |
| `/account` | Customer account |
| `/orders` | Customer order history |
| `/journal` | Journal/articles |
| `/contact` | Contact |
| `/policies/*` | Store policies |

## Public modules

- Header, navigation, footer and search
- Home sections and carousels
- Product cards, product detail, image zoom and variants
- Category and shop filters/sorting
- Wishlist
- Cart and quantity management
- Checkout and payment initiation
- Customer registration/login and account
- Order history and order status
- Journal/contact/policy pages
- Theme preference and motion effects

## Public request flow

1. Next.js renders SEO-friendly pages and product information.
2. Browser interactions call typed API client functions.
3. API validates cart lines, prices, stock, coupon and delivery rules.
4. Checkout creates a pending order/payment attempt on the server.
5. Payment provider handles payment securely.
6. Verified webhook updates payment/order state.
7. Inventory and notification jobs run server-side.
8. Storefront displays server-confirmed order status.

Never trust client-side product prices, stock counts, discount totals, payment status or order status.

## Existing public visual identity must remain

The current supplied storefront source is kept under `public/legacy/` as the migration reference. During React migration preserve:
- Exact light/off-white default theme.
- Saved light/dark choice under the existing `dostelo-theme` key unless a deliberate migration is planned.
- Existing CSS custom properties and all actual color values.
- Typography, font loading, letter spacing, spacing, widths, borders, radii and shadows.
- Existing hero, section, product-card and navigation layouts.
- Responsive breakpoints and mobile layout.
- Existing animation names, duration, delay, easing and sequencing.
- Ink-bleed transition and its fallback behavior.
- Fly-to-bag / paper-plane animation and trail.
- Scroll reveal, carousel, product image zoom, modal and toast behavior.
- Existing asset filenames and image crop/position rules.

Do not substitute a new animation library for an existing effect unless the resulting behavior is proven equivalent. Keep CSS animations where CSS is the best match; use React state/events to trigger them.
