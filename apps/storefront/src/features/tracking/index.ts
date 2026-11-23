/**
 * Visitor tracking feature (Phase 5). The Tracker component is
 * mounted once in the root layout; getVisitorId is the small
 * surface the checkout integration will use to pass the visitor
 * id to place-order so a guest order can link the session
 * through the consented checkout flow.
 */
export { default } from './Tracker';
export {
  getVisitorId,
  getSessionId,
  getMarketingConsent,
  trackEvent,
  VISITOR_ID_KEY,
  SESSION_ID_KEY,
  CONSENT_KEY,
} from './tracker';
