import { Injectable } from '@nestjs/common';
import type { Prisma, ReturnRequest as ReturnRow } from '@prisma/client';
import type {
  ReturnEvent,
  ReturnLine,
  ReturnRequest,
} from '@dostelo/types';
import {
  fromEnum,
  iso,
  toEnum,
  toMoney,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  ReturnsRepository,
  type ReturnFilter,
} from './returns.repository';

function toDomain(row: ReturnRow): ReturnRequest {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    kind: fromEnum(row.kind),
    status: fromEnum(row.status),
    reason: row.reason,
    note: row.note,
    resolutionType:
      row.resolutionType as ReturnRequest['resolutionType'],
    condition: row.condition,
    assigneeId: row.assigneeId,
    pickupScheduledAt: row.pickupScheduledAt
      ? iso(row.pickupScheduledAt)
      : null,
    receivedAt: row.receivedAt ? iso(row.receivedAt) : null,
    inspection: row.inspection
      ? (row.inspection as unknown as ReturnRequest['inspection'])
      : null,
    items: row.items as unknown as ReturnLine[],
    total: toMoney(row.totalMinor, row.currency),
    refundState: row.refundState as ReturnRequest['refundState'],
    refundId: row.refundId,
    restocked: row.restocked,
    createdById: row.createdById,
    decidedById: row.decidedById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toRow(request: ReturnRequest): Prisma.ReturnRequestUncheckedCreateInput {
  return {
    id: request.id,
    orderId: request.orderId,
    orderNumber: request.orderNumber,
    customerId: request.customerId,
    kind: toEnum<ReturnRow['kind']>(request.kind),
    status: toEnum<ReturnRow['status']>(request.status),
    reason: request.reason,
    note: request.note,
    resolutionType: request.resolutionType,
    condition: request.condition,
    assigneeId: request.assigneeId,
    pickupScheduledAt: request.pickupScheduledAt
      ? new Date(request.pickupScheduledAt)
      : null,
    receivedAt: request.receivedAt
      ? new Date(request.receivedAt)
      : null,
    inspection: request.inspection
      ? (request.inspection as unknown as Prisma.InputJsonValue)
      : undefined,
    items: request.items as unknown as Prisma.InputJsonValue,
    totalMinor: request.total.amountMinor,
    currency: request.total.currency,
    refundState: request.refundState,
    refundId: request.refundId,
    restocked: request.restocked,
    createdById: request.createdById,
    decidedById: request.decidedById,
  };
}

/**
 * Prisma returns repository over the ReturnRequest model. The
 * returned lines ride in the items JSON column as a snapshot, so
 * later catalogue or order changes never rewrite a request.
 */
@Injectable()
export class PrismaReturnsRepository extends ReturnsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(
    request: ReturnRequest,
    tx?: Tx,
  ): Promise<ReturnRequest> {
    const row = await this.db(tx).returnRequest.create({
      data: toRow(request),
    });
    return toDomain(row);
  }

  async save(request: ReturnRequest, tx?: Tx): Promise<void> {
    const { id, ...data } = toRow(request);
    await this.db(tx).returnRequest.update({ where: { id }, data });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<ReturnRequest | null> {
    const row = await this.db(tx).returnRequest.findUnique({
      where: { id },
    });
    return row ? toDomain(row) : null;
  }

  async list(
    filter?: ReturnFilter,
    tx?: Tx,
  ): Promise<ReturnRequest[]> {
    const rows = await this.db(tx).returnRequest.findMany({
      where: {
        status: filter?.status ? toEnum<ReturnRow['status']>(filter.status) : undefined,
        orderNumber: filter?.orderNumber,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }

  async appendEvent(event: ReturnEvent, tx?: Tx): Promise<void> {
    await this.db(tx).returnEvent.create({
      data: {
        id: event.id,
        returnId: event.returnId,
        status: toEnum<ReturnRow['status']>(event.status),
        note: event.note,
        actorId: event.actorId,
        createdAt: new Date(event.createdAt),
      },
    });
  }

  async listEvents(
    returnId: string,
    tx?: Tx,
  ): Promise<ReturnEvent[]> {
    const rows = await this.db(tx).returnEvent.findMany({
      where: { returnId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      returnId: row.returnId,
      status: fromEnum(row.status),
      note: row.note,
      actorId: row.actorId,
      createdAt: iso(row.createdAt),
    }));
  }
}
