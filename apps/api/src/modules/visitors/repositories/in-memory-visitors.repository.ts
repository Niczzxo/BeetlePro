import { Injectable } from '@nestjs/common';
import type {
  ConsentRecord,
  ConsentScope,
  IdentityLink,
  VisitorSession,
} from '@dostelo/types';
import {
  InMemoryDatabase,
  type StoredVisitorEvent,
} from '../../../store/in-memory.store';
import { VisitorsRepository } from './visitors.repository';

@Injectable()
export class InMemoryVisitorsRepository extends VisitorsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  upsertSession(session: VisitorSession): VisitorSession {
    this.db.visitorSessions.set(session.id, session);
    return session;
  }

  findSession(sessionId: string): VisitorSession | null {
    return this.db.visitorSessions.get(sessionId) ?? null;
  }

  listSessions(): VisitorSession[] {
    return [...this.db.visitorSessions.values()];
  }

  listSessionsForVisitor(visitorId: string): VisitorSession[] {
    return this.listSessions().filter(
      (session) => session.visitorId === visitorId,
    );
  }

  listSessionsForCustomer(customerId: string): VisitorSession[] {
    return this.listSessions().filter(
      (session) => session.customerId === customerId,
    );
  }

  appendEvent(event: StoredVisitorEvent): StoredVisitorEvent {
    this.db.visitorEvents.push(event);
    return event;
  }

  listEvents(): StoredVisitorEvent[] {
    return [...this.db.visitorEvents];
  }

  listEventsForSession(sessionId: string): StoredVisitorEvent[] {
    return this.db.visitorEvents.filter(
      (event) => event.sessionId === sessionId,
    );
  }

  listEventsForVisitor(visitorId: string): StoredVisitorEvent[] {
    return this.db.visitorEvents.filter(
      (event) => event.visitorId === visitorId,
    );
  }

  appendConsent(record: ConsentRecord): ConsentRecord {
    this.db.consentRecords.push(record);
    return record;
  }

  latestConsent(
    visitorId: string,
    scope: ConsentScope,
  ): ConsentRecord | null {
    const matches = this.db.consentRecords.filter(
      (record) => record.visitorId === visitorId && record.scope === scope,
    );
    return matches[matches.length - 1] ?? null;
  }

  appendLink(link: IdentityLink): IdentityLink {
    this.db.identityLinks.push(link);
    return link;
  }

  listLinksForVisitor(visitorId: string): IdentityLink[] {
    return this.db.identityLinks.filter(
      (link) => link.visitorId === visitorId,
    );
  }

  findLink(
    visitorId: string,
    customerId: string,
  ): IdentityLink | null {
    return (
      this.db.identityLinks.find(
        (link) =>
          link.visitorId === visitorId && link.customerId === customerId,
      ) ?? null
    );
  }
}
