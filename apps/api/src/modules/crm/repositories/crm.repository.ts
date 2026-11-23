import type { CustomerNote } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/**
 * CRM persistence seam (Phase 5): staff notes on customers. Tags
 * live on the customer record itself (CustomersRepository), which
 * matches the schema: Customer.tags plus the relational
 * CustomerTag model.
 */
export abstract class CrmRepository {
  abstract appendNote(
    note: CustomerNote,
    tx?: Tx,
  ): Promise<CustomerNote>;
  abstract listNotes(
    customerId: string,
    tx?: Tx,
  ): Promise<CustomerNote[]>;
}
