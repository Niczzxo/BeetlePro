import type {
  ConsentRecord,
  ConsentScope,
  IdentityLink,
  VisitorSession,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';
import type { StoredVisitorEvent } from '../../../store/in-memory.store';

/**
 * Visitor persistence seam (Phase 5). The Prisma implementation
 * maps to the VisitorSession, VisitorEvent, ConsentRecord and
 * IdentityLink models in the database schema.
 */
export abstract class VisitorsRepository {
  abstract upsertSession(
    session: VisitorSession,
    tx?: Tx,
  ): Promise<VisitorSession>;
  abstract findSession(
    sessionId: string,
    tx?: Tx,
  ): Promise<VisitorSession | null>;
  abstract listSessions(tx?: Tx): Promise<VisitorSession[]>;
  abstract listSessionsForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<VisitorSession[]>;
  abstract listSessionsForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<VisitorSession[]>;
  abstract appendEvent(
    event: StoredVisitorEvent,
    tx?: Tx,
  ): Promise<StoredVisitorEvent>;
  abstract listEvents(tx?: Tx): Promise<StoredVisitorEvent[]>;
  abstract listEventsForSession(
    sessionId: string,
    tx?: Tx,
  ): Promise<StoredVisitorEvent[]>;
  abstract listEventsForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<StoredVisitorEvent[]>;
  abstract appendConsent(
    record: ConsentRecord,
    tx?: Tx,
  ): Promise<ConsentRecord>;
  /** Latest consent record for a visitor and scope, or null when
   * the visitor never decided that scope. */
  abstract latestConsent(
    visitorId: string,
    scope: ConsentScope,
    tx?: Tx,
  ): Promise<ConsentRecord | null>;
  abstract appendLink(
    link: IdentityLink,
    tx?: Tx,
  ): Promise<IdentityLink>;
  /** Associates the visitor's events that carry no customer yet
   * with the customer (the write half of an identity link; see
   * VisitorsService.applyLink). */
  abstract linkEventsToCustomer(
    visitorId: string,
    customerId: string,
    tx?: Tx,
  ): Promise<void>;
  abstract listLinksForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<IdentityLink[]>;
  abstract findLink(
    visitorId: string,
    customerId: string,
    tx?: Tx,
  ): Promise<IdentityLink | null>;
}
