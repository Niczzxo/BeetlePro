import type { DataExportRecord, StoredBackup } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';
import type { StoredBackupRecord } from '../../../store/in-memory.store';

/** Backup seam: export records (counts only) and, from the
 * redesign, stored backup snapshots kept in the database. */
export abstract class BackupRepository {
  abstract create(
    record: DataExportRecord,
    tx?: Tx,
  ): Promise<DataExportRecord>;
  abstract list(tx?: Tx): Promise<DataExportRecord[]>;
  abstract createStoredBackup(
    record: StoredBackupRecord,
    tx?: Tx,
  ): Promise<void>;
  abstract listStoredBackups(tx?: Tx): Promise<StoredBackup[]>;
  abstract findStoredBackup(
    id: string,
    tx?: Tx,
  ): Promise<StoredBackupRecord | null>;
  abstract deleteStoredBackup(id: string, tx?: Tx): Promise<boolean>;
}
