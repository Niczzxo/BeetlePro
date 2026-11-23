import type {
  ConsentRecord,
  ConsentScope,
  IdentityLink,
  VisitorSession,
} from '@dostelo/types';
import type { StoredVisitorEvent } from '../../../store/in-memory.store';

/**
 * Visitor persistence seam (Phase 5). The Prisma implementation
 * will map to the VisitorSession, VisitorEvent, ConsentRecord and
 * IdentityLink models in the database schema.
 */
export abstract class VisitorsRepository {
  abstract upsertSession(session: VisitorSession): VisitorSession;
  abstract findSession(sessionId: string): VisitorSession | null;
  abstract listSessions(): VisitorSession[];
  abstract listSessionsForVisitor(visitorId: string): VisitorSession[];
  abstract listSessionsForCustomer(
    customerId: string,
  ): VisitorSession[];
  abstract appendEvent(event: StoredVisitorEvent): StoredVisitorEvent;
  abstract listEvents(): StoredVisitorEvent[];
  abstract listEventsForSession(
    sessionId: string,
  ): StoredVisitorEvent[];
  abstract listEventsForVisitor(
    visitorId: string,
  ): StoredVisitorEvent[];
  abstract appendConsent(record: ConsentRecord): ConsentRecord;
  /** Latest consent record for a visitor and scope, or null when
   * the visitor never decided that scope. */
  abstract latestConsent(
    visitorId: string,
    scope: ConsentScope,
  ): ConsentRecord | null;
  abstract appendLink(link: IdentityLink): IdentityLink;
  abstract listLinksForVisitor(visitorId: string): IdentityLink[];
  abstract findLink(
    visitorId: string,
    customerId: string,
  ): IdentityLink | null;
}
