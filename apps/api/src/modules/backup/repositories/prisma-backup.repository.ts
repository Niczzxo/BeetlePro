import { Injectable } from '@nestjs/common';
import type { Prisma, StoredBackup as BackupRow } from '@prisma/client';
import type { DataExportRecord, StoredBackup } from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredBackupRecord } from '../../../store/in-memory.store';
import { BackupRepository } from './backup.repository';

function exportToDomain(row: {
  id: string;
  requestedById: string | null;
  counts: unknown;
  collections: unknown;
  byteSize: number;
  createdAt: Date;
}): DataExportRecord {
  return {
    id: row.id,
    requestedById: row.requestedById,
    counts: row.counts as Record<string, number>,
    collections: (row.collections as string[] | null) ?? [],
    byteSize: row.byteSize,
    createdAt: iso(row.createdAt),
  };
}

function backupToView(row: BackupRow): StoredBackup {
  return {
    id: row.id,
    createdById: row.createdById,
    byteSize: row.byteSize,
    checksum: row.checksum,
    status: 'ready',
    collections: row.collections as string[],
    createdAt: iso(row.createdAt),
  };
}

/** Prisma backup repository over the DataExport and
 * StoredBackup models. */
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
        collections: record.collections as Prisma.InputJsonValue,
        byteSize: record.byteSize,
      },
    });
    return exportToDomain(row);
  }

  async list(tx?: Tx): Promise<DataExportRecord[]> {
    const rows = await this.db(tx).dataExport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(exportToDomain);
  }

  async createStoredBackup(
    record: StoredBackupRecord,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).storedBackup.create({
      data: {
        id: record.id,
        createdById: record.createdById,
        byteSize: record.byteSize,
        checksum: record.checksum,
        collections: record.collections as Prisma.InputJsonValue,
        snapshot: JSON.parse(record.snapshot) as Prisma.InputJsonValue,
      },
    });
  }

  async listStoredBackups(tx?: Tx): Promise<StoredBackup[]> {
    const rows = await this.db(tx).storedBackup.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(backupToView);
  }

  async findStoredBackup(
    id: string,
    tx?: Tx,
  ): Promise<StoredBackupRecord | null> {
    const row = await this.db(tx).storedBackup.findUnique({
      where: { id },
    });
    if (!row) return null;
    return {
      id: row.id,
      createdById: row.createdById,
      byteSize: row.byteSize,
      checksum: row.checksum,
      collections: row.collections as string[],
      snapshot: JSON.stringify(row.snapshot),
      createdAt: iso(row.createdAt),
    };
  }

  async deleteStoredBackup(id: string, tx?: Tx): Promise<boolean> {
    const result = await this.db(tx).storedBackup.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }
}
