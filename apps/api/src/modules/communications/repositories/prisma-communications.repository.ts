import { Injectable } from '@nestjs/common';
import type {
  CommunicationChannel,
  CommunicationLog as CommunicationLogRow,
  CommunicationLogStatus,
} from '@prisma/client';
import type { CommunicationLog } from '@dostelo/types';
import { date, fromEnum, iso, toEnum } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  CommunicationsRepository,
  type CommunicationLogFilter,
} from './communications.repository';

/** Prisma communications repository over the append-only
 * CommunicationLog model. */
@Injectable()
export class PrismaCommunicationsRepository extends CommunicationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toEntry(row: CommunicationLogRow): CommunicationLog {
    return {
      id: row.id,
      channel: fromEnum(row.channel),
      kind: row.kind as CommunicationLog['kind'],
      status: fromEnum(row.status),
      toAddress: row.toAddress,
      customerId: row.customerId,
      visitorId: row.visitorId,
      leadId: row.leadId,
      abandonedCartId: row.abandonedCartId,
      templateKey: row.templateKey,
      subject: row.subject,
      body: row.body,
      callOutcome: row.callOutcome as CommunicationLog['callOutcome'],
      staffId: row.staffId,
      providerMessageId: row.providerMessageId,
      detail: row.detail,
      createdAt: iso(row.createdAt),
    };
  }

  async append(
    entry: CommunicationLog,
    tx?: Tx,
  ): Promise<CommunicationLog> {
    const row = await this.db(tx).communicationLog.create({
      data: {
        id: entry.id,
        channel: toEnum<CommunicationChannel>(entry.channel),
        kind: entry.kind,
        status: toEnum<CommunicationLogStatus>(entry.status),
        toAddress: entry.toAddress,
        customerId: entry.customerId,
        visitorId: entry.visitorId,
        leadId: entry.leadId,
        abandonedCartId: entry.abandonedCartId,
        templateKey: entry.templateKey,
        subject: entry.subject,
        body: entry.body,
        callOutcome: entry.callOutcome,
        staffId: entry.staffId,
        providerMessageId: entry.providerMessageId,
        detail: entry.detail,
        createdAt: date(entry.createdAt),
      },
    });
    return this.toEntry(row);
  }

  async list(
    filter: CommunicationLogFilter,
    tx?: Tx,
  ): Promise<CommunicationLog[]> {
    const rows = await this.db(tx).communicationLog.findMany({
      where: {
        channel: filter.channel
          ? toEnum<CommunicationChannel>(filter.channel)
          : undefined,
        status: filter.status
          ? toEnum<CommunicationLogStatus>(filter.status)
          : undefined,
        customerId: filter.customerId,
        leadId: filter.leadId,
        abandonedCartId: filter.abandonedCartId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toEntry(row));
  }
}
