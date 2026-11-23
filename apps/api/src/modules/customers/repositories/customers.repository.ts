import type { Tx } from '../../../prisma/prisma.service';
import type { StoredCustomer } from '../../../store/in-memory.store';

/**
 * Customer persistence seam. Records are StoredCustomer (the public
 * Customer plus the password hash); services strip the hash before
 * anything leaves the module. The Prisma implementation maps to
 * the User and Customer models in the database schema.
 */
export abstract class CustomersRepository {
  abstract create(
    customer: StoredCustomer,
    tx?: Tx,
  ): Promise<StoredCustomer>;
  abstract save(customer: StoredCustomer, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<StoredCustomer | null>;
  abstract findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<StoredCustomer | null>;
  abstract findByPhone(
    phone: string,
    tx?: Tx,
  ): Promise<StoredCustomer | null>;
  /** Every stored customer, in insertion order. Staff reads only;
   * the route guard (customers.read) is what keeps this
   * staff-shaped, and the service strips password hashes before
   * anything is returned. */
  abstract list(tx?: Tx): Promise<StoredCustomer[]>;
}
