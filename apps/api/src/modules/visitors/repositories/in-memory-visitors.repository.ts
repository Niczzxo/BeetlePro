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

  async upsertSession(session: VisitorSession): Promise<VisitorSession> {
    this.db.visitorSessions.set(session.id, session);
    return session;
  }

  async findSession(sessionId: string): Promise<VisitorSession | null> {
    return this.db.visitorSessions.get(sessionId) ?? null;
  }

  async listSessions(): Promise<VisitorSession[]> {
    return [...this.db.visitorSessions.values()];
  }

  async listSessionsForVisitor(visitorId: string): Promise<VisitorSession[]> {
    return (await this.listSessions()).filter(
      (session) => session.visitorId === visitorId,
    );
  }

  async listSessionsForCustomer(customerId: string): Promise<VisitorSession[]> {
    return (await this.listSessions()).filter(
      (session) => session.customerId === customerId,
    );
  }

  async appendEvent(event: StoredVisitorEvent): Promise<StoredVisitorEvent> {
    this.db.visitorEvents.push(event);
    return event;
  }

  async listEvents(): Promise<StoredVisitorEvent[]> {
    return [...this.db.visitorEvents];
  }

  async listEventsForSession(sessionId: string): Promise<StoredVisitorEvent[]> {
    return this.db.visitorEvents.filter(
      (event) => event.sessionId === sessionId,
    );
  }

  async listEventsForVisitor(visitorId: string): Promise<StoredVisitorEvent[]> {
    return this.db.visitorEvents.filter(
      (event) => event.visitorId === visitorId,
    );
  }

  async appendConsent(record: ConsentRecord): Promise<ConsentRecord> {
    this.db.consentRecords.push(record);
    return record;
  }

  async latestConsent(
    visitorId: string,
    scope: ConsentScope,
  ): Promise<ConsentRecord | null> {
    const matches = this.db.consentRecords.filter(
      (record) => record.visitorId === visitorId && record.scope === scope,
    );
    return matches[matches.length - 1] ?? null;
  }

  async appendLink(link: IdentityLink): Promise<IdentityLink> {
    this.db.identityLinks.push(link);
    return link;
  }

  async linkEventsToCustomer(
    visitorId: string,
    customerId: string,
  ): Promise<void> {
    for (const event of this.db.visitorEvents) {
      if (event.visitorId === visitorId && event.customerId === null) {
        event.customerId = customerId;
      }
    }
  }

  async listLinksForVisitor(visitorId: string): Promise<IdentityLink[]> {
    return this.db.identityLinks.filter(
      (link) => link.visitorId === visitorId,
    );
  }

  async findLink(
    visitorId: string,
    customerId: string,
  ): Promise<IdentityLink | null> {
    return (
      this.db.identityLinks.find(
        (link) =>
          link.visitorId === visitorId && link.customerId === customerId,
      ) ?? null
    );
  }
}
