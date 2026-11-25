import { Injectable } from '@nestjs/common';
import type { DataExportRecord, StoredBackup } from '@dostelo/types';
import {
  InMemoryDatabase,
  type StoredBackupRecord,
} from '../../../store/in-memory.store';
import { BackupRepository } from './backup.repository';

function toView(record: StoredBackupRecord): StoredBackup {
  return {
    id: record.id,
    createdById: record.createdById,
    byteSize: record.byteSize,
    checksum: record.checksum,
    status: 'ready',
    collections: record.collections,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class InMemoryBackupRepository extends BackupRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(record: DataExportRecord): Promise<DataExportRecord> {
    this.db.dataExports.set(record.id, record);
    return record;
  }

  async list(): Promise<DataExportRecord[]> {
    return [...this.db.dataExports.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async createStoredBackup(record: StoredBackupRecord): Promise<void> {
    this.db.storedBackups.set(record.id, { ...record });
  }

  async listStoredBackups(): Promise<StoredBackup[]> {
    return [...this.db.storedBackups.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toView);
  }

  async findStoredBackup(
    id: string,
  ): Promise<StoredBackupRecord | null> {
    const record = this.db.storedBackups.get(id);
    return record ? { ...record } : null;
  }

  async deleteStoredBackup(id: string): Promise<boolean> {
    return this.db.storedBackups.delete(id);
  }
}
