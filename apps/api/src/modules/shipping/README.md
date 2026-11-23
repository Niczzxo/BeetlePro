# Shipping and Courier

Courier booking and tracking (Phase 6, chunk 2), following the
Shipping / Courier module in docs/ADMIN_PORTAL.md and the
provider honesty pattern set by payments (Phase 3) and
communications (Phase 6, chunk 1).

## Couriers and configuration

One adapter per courier, routed by the CourierProviderRegistry.
All courier HTTP goes through the injectable CourierHttpClient,
so tests stand a test double at the network boundary and no
test ever touches a real courier.

- pathao (api-hermes.pathao.com): an OAuth-style token grant at
  /aladdin/api/v1/issue-token, parcel creation at
  /aladdin/api/v1/orders (the answer's consignment_id is the
  tracking id), status reads at /aladdin/api/v1/orders/{id}.
  Configured by PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET,
  PATHAO_USERNAME, PATHAO_PASSWORD and PATHAO_STORE_ID
  (PATHAO_API_BASE_URL overrides the host). Webhook secret:
  PATHAO_WEBHOOK_SECRET.
- steadfast (portal.steadfast.com.bd/api/v1): Api-Key and
  Secret-Key headers, parcel creation at POST /create_order with
  the order number as the invoice (the answer's consignment_id
  is the tracking id), status reads at
  GET /status_by_cid/{consignment_id}. Configured by
  STEADFAST_API_KEY and STEADFAST_SECRET_KEY
  (STEADFAST_API_BASE_URL overrides the host). Webhook secret:
  STEADFAST_WEBHOOK_SECRET.
- redx (openapi.redx.com.bd/v1): an API-ACCESS-TOKEN header,
  parcel creation at POST /parcel with the order number as
  merchant_invoice_id (the answer's tracking_id is the tracking
  id), tracking reads at GET /parcel/track/{tracking_id}.
  Configured by REDX_ACCESS_TOKEN (REDX_API_BASE_URL overrides
  the host). Webhook secret: REDX_WEBHOOK_SECRET.

## Honesty contract

- A courier without merchant credentials books nothing: the
  shipment is recorded in the 'not-configured' status with the
  missing environment variables named, and its tracking id is
  null. Nothing is ever shown as booked that was not booked.
- A configured courier that refuses, is unreachable, or answers
  without a tracking id records a 'failed' shipment with the
  courier's answer preserved as the event note.
- A 'sent'-style claim does not exist here: a shipment reaches
  'created' only with a courier-issued tracking id.

## Canonical statuses

Courier raw statuses map onto one vocabulary: not-configured,
created, picked-up, in-transit, delivered, returned, failed,
cancelled. Each adapter carries its own ordered substring rules
(providers/*.provider.ts); the raw wording is preserved on the
shipment (lastRawStatus) and on every ShipmentStatusEvent.
Statuses the mapping does not recognise are recorded, never
applied.

## Booking rules

POST /v1/shipping (shipping.edit) books from an order number.
The recipient name, phone and address, and the COD amount come
from the order itself, never from the request: the COD amount
is the order total when the order carries an unpaid COD
payment, and zero for a prepaid order. Shipments are booked
only for orders in confirmed, processing, packed or
ready-to-ship; a pending order (not yet confirmed), a shipped
or delivered order, and cancelled or returned orders are
refused with the state named. A second booking is refused
while an earlier shipment for the order is created, picked-up,
in-transit or delivered; a not-configured, failed, returned or
cancelled shipment does not block a fresh booking.

## Status sync and the order

POST /v1/shipping/:id/refresh (shipping.edit) asks the courier
for the current status. A shipment with no tracking id has
nothing to refresh and answers so; an unconfigured courier
cannot be asked; an unchanged status records nothing.

Courier reports move the order only through the orders
service's legal transitions: picked-up and in-transit walk the
order to shipped, delivered walks it to delivered (one flow
step at a time, each recorded as an order status event), and
returned moves a delivered order to returned. A return
reported before delivery never walks the order through
delivered, which would wrongly settle COD collection.

## Courier webhooks

POST /v1/webhooks/couriers/:courier accepts deliveries for
pathao, steadfast and redx. Trust rules, mirroring the payment
webhooks:

1. Any other courier name is a 404.
2. With no webhook secret configured for the courier, the
   delivery is rejected (503). Unsigned state changes are
   never trusted.
3. The signature is HMAC-SHA256 of the raw request body with
   the courier's webhook secret, sent as hex in the
   x-courier-signature header (this codebase's integration
   shape, as with the bKash payment webhook). A bad signature
   is a 401 and nothing is recorded.
4. A verified delivery is recorded keyed by courier plus
   provider event id (the payload's event id when present,
   else a hash of the body); a redelivery returns duplicate
   true and applies nothing.
5. A first, verified delivery applies its mapped status to the
   shipment and, through the legal flow, to the order.

## Endpoints

Staff (AuthGuard plus PermissionsGuard):

- POST /v1/shipping (shipping.edit): book a parcel
- GET /v1/shipping (shipping.read), filters: courier, status,
  orderNumber
- GET /v1/shipping/:id (shipping.read): shipment plus its
  status history
- POST /v1/shipping/:id/refresh (shipping.edit)

Public (signature is the credential):

- POST /v1/webhooks/couriers/:courier

Audit actions: shipment.created, shipment.status-updated
(staff actor for endpoint actions, system for webhook-driven
updates).
