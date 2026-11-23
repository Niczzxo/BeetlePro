import type { DataExportRecord } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/** Data export record seam, over the DataExport model in the
 * Prisma implementation. Records hold counts only. */
export abstract class BackupRepository {
  abstract create(
    record: DataExportRecord,
    tx?: Tx,
  ): Promise<DataExportRecord>;
  abstract list(tx?: Tx): Promise<DataExportRecord[]>;
}
