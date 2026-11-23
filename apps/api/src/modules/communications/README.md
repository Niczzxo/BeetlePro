# Communication Center

One module sends (or honestly fails to send) every customer
message and records every staff call (Phase 6).

## Honesty contract

Every call to CommunicationsService.send or logManualCall
writes exactly one CommunicationLog entry, including refusals.
A message is marked 'sent' only when a configured provider
confirms it. Providers without credentials answer
'not-configured', following the payment gateway pattern: the
attempt is recorded, nothing is faked.

Checks run in a fixed order before any provider is touched:

1. Address: no phone (whatsapp, sms, call) or no email (email)
   records refused-no-contact.
2. Suppression: a Phase 5 SuppressionRecord matching the
   customer id or the phone records refused-suppressed. The
   records are shared with the leads module, so an opt-out
   anywhere suppresses contact everywhere.
3. Consent: a visitor whose latest marketing consent is a
   denial records refused-consent.

## Channels and providers

The registry routes a channel to its adapter:

- whatsapp: the WhatsApp Business Cloud API (Meta Graph API).
  Configured by WHATSAPP_ACCESS_TOKEN and
  WHATSAPP_PHONE_NUMBER_ID (WHATSAPP_API_BASE_URL overrides the
  Graph host).
- email: a generic transactional HTTPS API (from, to, subject,
  text with a bearer key). Configured by EMAIL_PROVIDER_API_URL,
  EMAIL_PROVIDER_API_KEY and EMAIL_FROM.
- sms: a generic HTTPS gateway (senderId, to, message).
  Configured by SMS_API_URL, SMS_API_KEY and SMS_SENDER_ID.
- call: the manual call channel. There is no telephony
  provider: staff place calls on their own phones. An automated
  send on this channel creates a call task (status
  'awaiting-staff') carrying the rendered script; it never
  claims a call happened.

## Manual call logging

POST /v1/communications/calls (guard: recovery.edit, because
logging a call is a recovery and CRM action; see the matrix
note in @dostelo/types) records a call a staff member placed
themselves: kind 'manual-call', status 'logged', with the
outcome (answered, no-answer, busy, wrong-number,
requested-callback, opted-out) and notes. It is a completed
staff action, distinct from an automated send. Suppression is
checked first even here, and the refusal is recorded instead.
An 'opted-out' outcome appends a SuppressionRecord, so the
number is never contacted again on any channel.

## Templates

Templates live in templates/message-templates.ts and render
server-side with {{variable}} substitution; the rendered text
is stored on the log entry, so what a customer was sent is
recoverable even after a template changes. The recovery
sequence ships four: recovery-whatsapp-1, recovery-email-1,
recovery-sms-1 and recovery-call-1 (the call script). The
Prisma MessageTemplate model is where staff-edited templates
land later.

## Endpoints

- GET /v1/communications/log (communications.read), filters:
  channel, status, customerId, leadId, abandonedCartId
- POST /v1/communications/calls (recovery.edit)

Audit actions: communication.call-logged,
communication.call-refused, communication.opted-out.
