import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ConsentScope as ConsentScopeEnum,
  type ConsentStatus as ConsentStatusEnum,
  type IdentityLinkBasis as IdentityLinkBasisEnum,
  type IdentityStatus as IdentityStatusEnum,
  type VisitorEvent as VisitorEventRow,
} from '@prisma/client';
import type {
  ConsentRecord,
  ConsentScope,
  IdentityLink,
  VisitorSession,
} from '@dostelo/types';
import { date, fromEnum, iso, toEnum } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredVisitorEvent } from '../../../store/in-memory.store';
import { VisitorsRepository } from './visitors.repository';

/**
 * Prisma visitor repository over VisitorSession, VisitorEvent,
 * ConsentRecord and IdentityLink. The privacy model is the
 * schema's: a session's customerId and an event's customerId are
 * only ever written by the service's authenticated or consented
 * link flows, exactly as in the in-memory implementation.
 */
@Injectable()
export class PrismaVisitorsRepository extends VisitorsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toSession(row: {
    id: string;
    visitorId: string;
    identityStatus: string;
    customerId: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }): VisitorSession {
    return {
      id: row.id,
      visitorId: row.visitorId,
      identityStatus: fromEnum(row.identityStatus),
      customerId: row.customerId,
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt),
    };
  }

  async upsertSession(
    session: VisitorSession,
    tx?: Tx,
  ): Promise<VisitorSession> {
    const data = {
      visitorId: session.visitorId,
      identityStatus: toEnum<IdentityStatusEnum>(session.identityStatus),
      customerId: session.customerId,
      firstSeenAt: date(session.firstSeenAt),
      lastSeenAt: date(session.lastSeenAt),
    };
    const row = await this.db(tx).visitorSession.upsert({
      where: { id: session.id },
      create: { id: session.id, ...data },
      update: data,
    });
    return this.toSession(row);
  }

  async findSession(
    sessionId: string,
    tx?: Tx,
  ): Promise<VisitorSession | null> {
    const row = await this.db(tx).visitorSession.findUnique({
      where: { id: sessionId },
    });
    return row ? this.toSession(row) : null;
  }

  async listSessions(tx?: Tx): Promise<VisitorSession[]> {
    const rows = await this.db(tx).visitorSession.findMany({
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toSession(row));
  }

  async listSessionsForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<VisitorSession[]> {
    const rows = await this.db(tx).visitorSession.findMany({
      where: { visitorId },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toSession(row));
  }

  async listSessionsForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<VisitorSession[]> {
    const rows = await this.db(tx).visitorSession.findMany({
      where: { customerId },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toSession(row));
  }

  private toEvent(row: VisitorEventRow): StoredVisitorEvent {
    return {
      id: row.id,
      visitorId: row.visitorId,
      sessionId: row.sessionId,
      type: row.type as StoredVisitorEvent['type'],
      customerId: row.customerId,
      path: row.path,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      marketingUsable: row.marketingUsable,
      occurredAt: iso(row.occurredAt),
    };
  }

  async appendEvent(
    event: StoredVisitorEvent,
    tx?: Tx,
  ): Promise<StoredVisitorEvent> {
    const row = await this.db(tx).visitorEvent.create({
      data: {
        id: event.id,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        type: event.type,
        customerId: event.customerId,
        path: event.path,
        payload:
          event.payload === null
            ? Prisma.JsonNull
            : (event.payload as Prisma.InputJsonValue),
        marketingUsable: event.marketingUsable,
        occurredAt: date(event.occurredAt),
      },
    });
    return this.toEvent(row);
  }

  async listEvents(tx?: Tx): Promise<StoredVisitorEvent[]> {
    const rows = await this.db(tx).visitorEvent.findMany({
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toEvent(row));
  }

  async listEventsForSession(
    sessionId: string,
    tx?: Tx,
  ): Promise<StoredVisitorEvent[]> {
    const rows = await this.db(tx).visitorEvent.findMany({
      where: { sessionId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toEvent(row));
  }

  async listEventsForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<StoredVisitorEvent[]> {
    const rows = await this.db(tx).visitorEvent.findMany({
      where: { visitorId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toEvent(row));
  }

  async appendConsent(
    record: ConsentRecord,
    tx?: Tx,
  ): Promise<ConsentRecord> {
    const row = await this.db(tx).consentRecord.create({
      data: {
        id: record.id,
        visitorId: record.visitorId,
        scope: toEnum<ConsentScopeEnum>(record.scope),
        status: toEnum<ConsentStatusEnum>(record.status),
        createdAt: date(record.createdAt),
      },
    });
    return {
      id: row.id,
      visitorId: row.visitorId,
      scope: fromEnum(row.scope),
      status: fromEnum(row.status),
      createdAt: iso(row.createdAt),
    };
  }

  async latestConsent(
    visitorId: string,
    scope: ConsentScope,
    tx?: Tx,
  ): Promise<ConsentRecord | null> {
    const row = await this.db(tx).consentRecord.findFirst({
      where: { visitorId, scope: toEnum<ConsentScopeEnum>(scope) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    if (!row) return null;
    return {
      id: row.id,
      visitorId: row.visitorId,
      scope: fromEnum(row.scope),
      status: fromEnum(row.status),
      createdAt: iso(row.createdAt),
    };
  }

  async appendLink(link: IdentityLink, tx?: Tx): Promise<IdentityLink> {
    const row = await this.db(tx).identityLink.upsert({
      where: {
        visitorId_customerId: {
          visitorId: link.visitorId,
          customerId: link.customerId,
        },
      },
      create: {
        id: link.id,
        visitorId: link.visitorId,
        customerId: link.customerId,
        basis: toEnum<IdentityLinkBasisEnum>(link.basis),
        createdAt: date(link.createdAt),
      },
      update: {},
    });
    return {
      id: row.id,
      visitorId: row.visitorId,
      customerId: row.customerId,
      basis: fromEnum(row.basis),
      createdAt: iso(row.createdAt),
    };
  }

  async linkEventsToCustomer(
    visitorId: string,
    customerId: string,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).visitorEvent.updateMany({
      where: { visitorId, customerId: null },
      data: { customerId },
    });
  }

  async listLinksForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<IdentityLink[]> {
    const rows = await this.db(tx).identityLink.findMany({
      where: { visitorId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      visitorId: row.visitorId,
      customerId: row.customerId,
      basis: fromEnum(row.basis),
      createdAt: iso(row.createdAt),
    }));
  }

  async findLink(
    visitorId: string,
    customerId: string,
    tx?: Tx,
  ): Promise<IdentityLink | null> {
    const row = await this.db(tx).identityLink.findUnique({
      where: { visitorId_customerId: { visitorId, customerId } },
    });
    if (!row) return null;
    return {
      id: row.id,
      visitorId: row.visitorId,
      customerId: row.customerId,
      basis: fromEnum(row.basis),
      createdAt: iso(row.createdAt),
    };
  }
}
