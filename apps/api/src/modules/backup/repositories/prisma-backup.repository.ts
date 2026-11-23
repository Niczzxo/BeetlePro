import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DataExportRecord } from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { BackupRepository } from './backup.repository';

/** Prisma backup repository over the DataExport model. */
@Injectable()
export class PrismaBackupRepository extends BackupRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(
    record: DataExportRecord,
    tx?: Tx,
  ): Promise<DataExportRecord> {
    const row = await this.db(tx).dataExport.create({
      data: {
        id: record.id,
        requestedById: record.requestedById,
        counts: record.counts as Prisma.InputJsonValue,
      },
    });
    return {
      id: row.id,
      requestedById: row.requestedById,
      counts: row.counts as Record<string, number>,
      createdAt: iso(row.createdAt),
    };
  }

  async list(tx?: Tx): Promise<DataExportRecord[]> {
    const rows = await this.db(tx).dataExport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      requestedById: row.requestedById,
      counts: row.counts as Record<string, number>,
      createdAt: iso(row.createdAt),
    }));
  }
}
