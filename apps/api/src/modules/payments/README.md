# Payments module

Phase 3, chunk 2. Owns payment attempts and their whole
lifecycle: initiation, COD collection, manual mobile banking
with staff verification, hosted gateway sessions, webhooks
(through the webhooks module), refunds and reconciliation
reads.

## Honesty rules

There are no merchant credentials in this repository and none
may be invented.

- A gateway whose credentials are not configured refuses
  initiation with a 503 "gateway not configured" error. The
  attempt is recorded as failed with a gateway-not-configured
  payment event. Nothing is ever recorded as paid on that path.
- A customer confirmation never marks a manual payment paid.
  Only the staff verification step does.
- A gateway refund that cannot run is recorded as
  gateway-not-configured and the payment is never marked
  refunded on that path.
- Every payment state change writes exactly one PaymentEvent.

## Channels and flows

- **cod** (channel `cod`): initiation parks the payment in
  `pending-collection`. The payments service follows the order
  status flow: delivered makes it `collected`, cancelled before
  delivery voids it (`cancelled`), and a return after delivery
  makes it `refunded` (the cash is handed back with the return).
- **bkash, nagad, rocket, upay** (channel `manual` by default):
  the flow the live storefront already uses. Initiation creates
  the attempt in `awaiting-customer` with the store's receiving
  instructions (store-configured text from store settings; the
  reference is the order number). The customer confirms with
  their sender number and transaction id
  (`POST /v1/payments/:paymentId/confirm`), which moves the
  payment to `verification-pending`. Staff verify or reject
  (`POST /v1/payments/:paymentId/verify`): paid makes it
  `successful` and adopts the reported transaction id as the
  provider transaction id; rejected makes it `failed`.
- **sslcommerz, card** (channel `gateway`): the SSLCommerz
  adapter creates a hosted session
  (`POST /v1/payments/initiate`) and returns the redirect URL.
  The signed IPN webhook is the only trusted confirmation.
- **bkash gateway** (channel `gateway`): only when
  `PAYMENTS_BKASH_MODE=gateway`. The tokenized adapter grants a
  token, creates the payment and returns the bkashURL.
- **shurjopay**: no adapter in this chunk; initiation reports
  the gateway as not configured.

Checkout creates its attempt through `PaymentsService`
(`initiateForCheckout`), so every order's payment is owned by
this module from the start.

## Endpoints

| Route | Who | Notes |
| --- | --- | --- |
| `POST /v1/payments/initiate` | customer | Starts or reuses an attempt; creates the gateway session for gateway channels. 503 when the gateway is not configured. |
| `GET /v1/payments` | staff-shaped | Reconciliation list; filters `gateway`, `status`, `orderId`. |
| `GET /v1/payments/summary` | staff-shaped | Counts and totals by gateway and by status. |
| `GET /v1/payments/:paymentId` | staff-shaped | Payment with its events and refunds. |
| `POST /v1/payments/:paymentId/confirm` | customer | Manual methods only: report sender number and transaction id. |
| `POST /v1/payments/:paymentId/verify` | staff | Guarded (Phase 4): requires the `payments.verify` permission. |
| `POST /v1/payments/:paymentId/refunds` | staff | Guarded (Phase 4): requires the `payments.refund` permission. |
| `POST /v1/payments/:paymentId/refunds/:refundId/confirm` | staff | Confirms a manual refund was handed back. Guarded (Phase 4): `payments.refund`. |

Verify and refund actions are written to the audit trail with
the acting staff member (Phase 4). The reconciliation reads
above stay staff-shaped in route design; guarding reads is part
of the admin portal chunk.

## Refunds

Only a paid payment (`successful` or `collected`) can be
refunded, and only one open refund per payment at a time. The
amount defaults to the still-unrefunded remainder.

- COD and manual payments: the refund is recorded as
  `manual-pending`; staff return the money outside any gateway
  and confirm. When completed refunds cover the payment, the
  payment becomes `refunded`.
- Gateway payments: the refund is routed through the adapter.
  Unconfigured gateways record it as `gateway-not-configured`
  with an explanatory note; the payment stays paid.

## Environment variables

Names only; real values live in the deployment environment and
are never committed.

SSLCommerz:

- `SSLCOMMERZ_STORE_ID`: merchant store id.
- `SSLCOMMERZ_STORE_PASSWORD`: store password; also verifies
  IPN webhook signatures.
- `SSLCOMMERZ_MODE`: `sandbox` (default) or `live`.
- `SSLCOMMERZ_API_BASE_URL`: optional override of the API host
  (used by local test doubles).

bKash:

- `PAYMENTS_BKASH_MODE`: `manual` (default) or `gateway`.
- `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`,
  `BKASH_PASSWORD`: tokenized checkout credentials.
- `BKASH_API_BASE_URL`: optional override of the API host.
- `BKASH_WEBHOOK_SECRET`: HMAC-SHA256 secret for webhook
  signature verification.

Shared:

- `API_URL`: public base URL of this API, used to build the
  gateway callback URLs. Falls back to `http://localhost` with
  `API_PORT`.

## Webhooks

`POST /v1/webhooks/:gateway` for `sslcommerz` and `bkash`
only; every other gateway is a 404 (COD and the manual methods
have no webhooks). Rules, enforced in the webhooks module:

- No webhook secret configured for the gateway: the delivery
  is rejected with 503. Unsigned state changes are never
  trusted.
- Bad signature: 401, nothing recorded, nothing applied.
  SSLCommerz uses its documented IPN scheme (md5 over the
  `verify_key` fields plus md5 of the store password); bKash
  uses HMAC-SHA256 of the raw body with `BKASH_WEBHOOK_SECRET`,
  sent in the `x-bkash-signature` header.
- Verified deliveries are stored keyed by gateway plus provider
  event id (SSLCommerz `val_id`, bKash `trxID`). A redelivery
  returns success with `duplicate: true` and applies nothing.
