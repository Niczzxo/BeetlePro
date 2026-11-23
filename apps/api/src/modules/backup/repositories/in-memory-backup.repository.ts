import { Injectable } from '@nestjs/common';
import type { DataExportRecord } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { BackupRepository } from './backup.repository';

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
}
