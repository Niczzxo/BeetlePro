import { Injectable } from '@nestjs/common';
import { Prisma, type AuditActorType } from '@prisma/client';
import type { AuditLogEntry } from '@dostelo/types';
import { date, fromEnum, iso, toEnum } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  AuditRepository,
  type AuditFilter,
} from './audit.repository';

/** Prisma audit repository: the append-only AuditLog model. */
@Injectable()
export class PrismaAuditRepository extends AuditRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async append(entry: AuditLogEntry, tx?: Tx): Promise<void> {
    await this.db(tx).auditLog.create({
      data: {
        id: entry.id,
        actorType: toEnum(entry.actorType),
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata:
          entry.metadata === null
            ? Prisma.JsonNull
            : (entry.metadata as Prisma.InputJsonValue),
        ipAddress: entry.ipAddress,
        createdAt: date(entry.createdAt),
      },
    });
  }

  async list(filter: AuditFilter, tx?: Tx): Promise<AuditLogEntry[]> {
    const rows = await this.db(tx).auditLog.findMany({
      where: {
        actorId: filter.actorId,
        actorType: filter.actorType
          ? toEnum<AuditActorType>(filter.actorType)
          : undefined,
        action: filter.action,
        createdAt: {
          gte: filter.from ? date(filter.from) : undefined,
          lte: filter.to ? date(filter.to) : undefined,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: filter.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      actorType: fromEnum(row.actorType),
      actorId: row.actorId,
      actorRole: (row.actorRole as AuditLogEntry['actorRole']) ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      ipAddress: row.ipAddress,
      createdAt: iso(row.createdAt),
    }));
  }
}
