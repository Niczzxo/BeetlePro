import type { LegalDocument } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/** Legal documents seam, over the LegalDocument model in the
 * Prisma implementation. Only saved documents exist behind the
 * seam; the service supplies label defaults for the rest. */
export abstract class LegalRepository {
  abstract findBySlug(
    slug: string,
    tx?: Tx,
  ): Promise<LegalDocument | null>;
  abstract save(document: LegalDocument, tx?: Tx): Promise<void>;
  abstract list(tx?: Tx): Promise<LegalDocument[]>;
}
