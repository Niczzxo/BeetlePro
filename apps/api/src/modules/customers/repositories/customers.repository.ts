import type { StoredCustomer } from '../../../store/in-memory.store';

/**
 * Customer persistence seam. Records are StoredCustomer (the public
 * Customer plus the password hash); services strip the hash before
 * anything leaves the module. The Prisma implementation will map to
 * the User and Customer models in the database schema.
 */
export abstract class CustomersRepository {
  abstract create(customer: StoredCustomer): StoredCustomer;
  abstract save(customer: StoredCustomer): void;
  abstract findById(id: string): StoredCustomer | null;
  abstract findByEmail(email: string): StoredCustomer | null;
  abstract findByPhone(phone: string): StoredCustomer | null;
  /** Every stored customer, in insertion order. Staff reads only;
   * the route guard (customers.read) is what keeps this
   * staff-shaped, and the service strips password hashes before
   * anything is returned. */
  abstract list(): StoredCustomer[];
}
