# Backend API and Database

## Backend technology

NestJS + TypeScript, PostgreSQL + Prisma, Redis + BullMQ.

## NestJS module pattern

Each business module should contain:
- `*.module.ts`: dependency wiring
- `*.controller.ts`: HTTP endpoints only
- `*.service.ts`: business rules
- `dto/`: request/response validation
- `repositories/`: database access
- `policies/`: authorization checks
- `events/`: domain events
- `*.spec.ts`: unit tests

Controllers must not contain large business workflows. Use services and transactions.

## Main database domains

- Identity: User, Customer, AdminUser, Role, Permission, Session
- Catalog: Product, ProductVariant, Category, ProductMedia, Price
- Inventory: Warehouse, StockItem, StockMovement, StockReservation
- Visitor: VisitorSession, ConsentRecord, VisitorEvent, IdentityLink
- Cart: Cart, CartItem, CartEvent
- CRM: CustomerProfile, CustomerNote, CustomerTag, CustomerTimeline
- Leads: Lead, LeadScore, LeadAssignment, FollowUpTask
- Recovery: RecoveryCampaign, RecoveryAttempt, SuppressionRecord
- Orders: Order, OrderItem, OrderAddress, OrderStatusEvent
- Payments: Payment, PaymentEvent, Refund, ReconciliationRecord
- Shipping: Shipment, ShipmentEvent, CourierProvider
- Communication: ContactPreference, MessageTemplate, MessageAttempt, CallTask
- Marketing: Campaign, Coupon, CampaignAttribution
- Governance: AuditLog, WebhookEvent, IdempotencyKey

## Data rules

- Use UUID/CUID primary keys consistently.
- Store money as integer minor units (e.g. paisa) plus ISO currency code; never use floating point for money.
- Store timestamps in UTC and render in the user's/store timezone.
- Add unique constraints and indexes for email/phone normalization, order number, SKU, provider transaction ID and webhook event ID.
- Use transactions for order/payment/inventory transitions.
- Verify provider webhook signatures and enforce idempotency.
- Encrypt secrets and sensitive tokens; keep them out of browser bundles and Git.
- Define retention and deletion/anonymization rules for visitor and customer data.
- Use database migrations in version control; never edit production schema manually.

## API namespaces

- `/v1/auth`
- `/v1/catalog`
- `/v1/customers`
- `/v1/visitor-events`
- `/v1/carts`
- `/v1/checkout`
- `/v1/orders`
- `/v1/payments`
- `/v1/inventory`
- `/v1/buyer-intelligence`
- `/v1/crm`
- `/v1/leads`
- `/v1/cart-recovery`
- `/v1/communication`
- `/v1/shipping`
- `/v1/reports`
- `/v1/admin/*`
- `/v1/webhooks/*`

Public and admin endpoints must have separate authorization policies even if they use the same underlying services.
