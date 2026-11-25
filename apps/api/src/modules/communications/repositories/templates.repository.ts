import type { MessageTemplate } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/** A staff-edited template as stored: the template plus the time
 * of its last edit. Stored templates override the code-versioned
 * built-ins in templates/message-templates.ts by key. */
export interface StoredMessageTemplate extends MessageTemplate {
  updatedAt: string;
}

/**
 * Message template persistence seam. Only staff edits live here;
 * the built-in templates stay code-versioned, and resolving a key
 * checks this store first, then the built-ins.
 */
export abstract class TemplatesRepository {
  abstract listStored(tx?: Tx): Promise<StoredMessageTemplate[]>;
  abstract findStored(
    key: string,
    tx?: Tx,
  ): Promise<StoredMessageTemplate | null>;
  abstract upsertStored(
    template: StoredMessageTemplate,
    tx?: Tx,
  ): Promise<StoredMessageTemplate>;
  abstract removeStored(key: string, tx?: Tx): Promise<boolean>;
}
