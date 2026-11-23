# Cart Recovery

Abandoned cart detection and the recovery sequence (Phase 6),
following the abandoned-cart workflow in docs/ADMIN_PORTAL.md.

## Detection

A cart becomes an AbandonedCart when all of these hold:

- it still has at least one item,
- it is not converted,
- it has been inactive for at least the stored threshold
  (`abandonedAfterMinutes`, seeded from
  CART_ABANDONED_AFTER_MINUTES, default 60),
- it has a contact path: a customer on the cart, or a tracked
  visitor session behind the cart's session token that is
  already linked to a customer.

A cart with no contact path is never flagged: there is nobody
the store may contact. Contact details come from the customer
record; the basis mirrors the leads rule (a customer with a
password is an 'account' basis, a passwordless checkout-created
record is a 'checkout' basis). The cart's own status stays
'active' so a returning customer can still check out with it;
the AbandonedCart record carries the recovery state.

Detection runs two ways over the same code path: the recurring
`cart-recovery.scan` job (re-armed every
CART_RECOVERY_SCAN_MINUTES), and the staff scan endpoint
POST /v1/cart-recovery/scan for operations and tests. Scans are
idempotent, and a scan also closes an open recovery whose cart
was emptied and recovers one whose cart converted elsewhere.

## Sequence and the queue seam

The stored sequence (defaults: WhatsApp after 1 hour, email
after 24 hours, staff call task after 72 hours; delays are
relative to the previous step) is editable by staff holding
recovery.edit via PUT /v1/cart-recovery/settings. Edits apply
to carts detected afterwards and to steps not yet scheduled.

Every step is one job on the JobQueue seam
(src/modules/jobs): the target architecture runs BullMQ on
Redis, which is unavailable here, so the bound implementation
is an in-process timer runner with the same semantics (delayed
enqueue, caller-chosen job ids, cancellation). No service calls
setTimeout directly. Each attempt stores its queue job id, so
cancellation is deterministic: when a recovery is recovered,
closed or cancelled, every scheduled attempt is cancelled in
the queue and marked cancelled.

Each step sends through the CommunicationsService, which
enforces suppression and consent and records the honest
outcome. A suppression or consent refusal stops the sequence
(the person said no; later steps would only be refused again)
and closes the recovery with reason 'contact-refused'. A
missing address for one channel records 'skipped-no-contact'
and the sequence continues on later channels.

## Recovery

Checkout calls markRecoveredForOrder after placing an order. A
recovery matches when the order came from the recovery's cart,
or when the same customer's order covers every line of the
recovery's cart. Matching sets status 'recovered', records the
order number, and cancels pending steps, so a customer who
buys is never chased. Recovery marking never throws into the
order flow.

## Recovery token

Each AbandonedCart carries a 24-byte random token. GET
/v1/recovery/:token is public: the token is the credential.
The view shows the cart contents priced from the current
catalog and never carries contact details, a customer id or a
visitor id. Recovered, closed, cancelled and expired tokens
answer with their honest status and no items. Token lifetime
is tokenTtlDays (seeded from CART_RECOVERY_TOKEN_TTL_DAYS,
default 30). The link placed in messages is
STOREFRONT_URL + /recover/<token>; the storefront page that
consumes it is a later chunk.

## Endpoints

Staff (AuthGuard plus PermissionsGuard):

- GET /v1/cart-recovery (recovery.read), optional ?status=
- GET /v1/cart-recovery/:id (recovery.read): recovery, attempts
  and its communication log entries
- GET /v1/cart-recovery/settings (recovery.read)
- PUT /v1/cart-recovery/settings (recovery.edit)
- POST /v1/cart-recovery/scan (recovery.edit)
- POST /v1/cart-recovery/:id/cancel (recovery.edit)
- POST /v1/cart-recovery/:id/run-step (recovery.edit): runs the
  next scheduled step now, for operations and testing

Public:

- GET /v1/recovery/:token

Audit actions: cart-recovery.detected, cart-recovery.step-executed,
cart-recovery.recovered, cart-recovery.cancelled,
cart-recovery.step-run, cart-recovery.settings-updated.
