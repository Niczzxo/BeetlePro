# Admin Portal: Responsibilities and Workflow

## Admin application

Admin runs as its own Next.js application at `admin.dostelo.com`. It shares the Dostelo brand tokens and component primitives, but uses an operations-focused layout. It does not need to copy the public storefront's hero or shopping animations. Avoid distracting motion in data tables and workflows.

## Main modules

1. Dashboard
2. Buyer Intelligence
3. CRM / Customers
4. Lead Pipeline
5. Abandoned Cart Recovery
6. Communication Center: WhatsApp, call tasks, email
7. Orders
8. Products and Categories
9. Inventory / Warehouses
10. Payments / Refunds / Reconciliation
11. Shipping / Courier
12. Returns and Exchanges
13. Marketing / Campaigns / Coupons
14. Reviews
15. Reports and Analytics
16. Website Content Management
17. Staff and Roles
18. Integrations
19. Audit Logs
20. Settings

## Staff roles

- Super Admin
- Store Manager
- Sales/CRM Manager
- Sales Agent
- Customer Support
- Product Manager
- Inventory Manager
- Finance/Accounts
- Shipping Manager
- Marketing Manager
- Analyst

Use permission keys such as `buyers.read`, `buyers.contact`, `orders.update`, `payments.refund`, `products.update`, `inventory.adjust`, `staff.manage`, and `settings.manage`.

## Buyer Intelligence workflow

1. Public site records first-party events such as product view, search, add-to-cart and checkout start.
2. Before optional analytics or marketing tracking, respect consent and applicable privacy rules.
3. Anonymous sessions use random first-party visitor/session identifiers, not covert device fingerprinting.
4. When a shopper voluntarily identifies themselves through account login, checkout or a submitted contact form, the server can associate eligible events with that customer under a documented lawful basis.
5. Admin shows identity confidence/status: Anonymous, Known Customer, Guest Checkout, or Unverified Contact.
6. Lead score uses transparent business signals such as recent product views, repeat visits, cart value and checkout progress. It must not claim anonymous visitors are known real buyers.
7. Contact actions are available only when contact details are provided and the relevant contact/marketing permission exists.
8. Record staff member, time, channel, purpose, result and opt-out status for each contact attempt.

## Abandoned-cart workflow

1. Cart is stored server-side for logged-in customers and optionally for a guest session.
2. A scheduled worker identifies carts inactive beyond a configured period.
3. Exclude carts with completed orders, expired stock, invalid contact, opt-out, or a frequency-cap violation.
4. Queue a recovery message only through channels the customer has agreed to receive.
5. For non-marketing operational follow-up, define the permitted purpose and applicable local legal basis.
6. Include a safe recovery link; do not expose cart/customer data in a guessable URL.
7. Cancel queued messages when the customer buys or opts out.
8. Attribute recovery orders without double-counting.

## Admin actions

All sensitive actions must be server-authorized, validated, rate-limited where appropriate, and written to an immutable audit trail.
