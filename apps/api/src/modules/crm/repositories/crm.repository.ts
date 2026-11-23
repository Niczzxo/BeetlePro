import type { CustomerNote } from '@dostelo/types';

/**
 * CRM persistence seam (Phase 5): staff notes on customers. Tags
 * live on the customer record itself (CustomersRepository), which
 * matches the schema: Customer.tags plus the relational
 * CustomerTag model.
 */
export abstract class CrmRepository {
  abstract appendNote(note: CustomerNote): CustomerNote;
  abstract listNotes(customerId: string): CustomerNote[];
}
