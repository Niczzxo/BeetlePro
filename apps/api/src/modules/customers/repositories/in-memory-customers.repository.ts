import { Injectable } from '@nestjs/common';
import {
  InMemoryDatabase,
  type StoredCustomer,
} from '../../../store/in-memory.store';
import { CustomersRepository } from './customers.repository';

@Injectable()
export class InMemoryCustomersRepository extends CustomersRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(customer: StoredCustomer): StoredCustomer {
    this.db.customers.set(customer.id, customer);
    return customer;
  }

  save(customer: StoredCustomer): void {
    this.db.customers.set(customer.id, customer);
  }

  findById(id: string): StoredCustomer | null {
    return this.db.customers.get(id) ?? null;
  }

  findByEmail(email: string): StoredCustomer | null {
    const needle = email.toLowerCase();
    return (
      [...this.db.customers.values()].find(
        (customer) => customer.email?.toLowerCase() === needle,
      ) ?? null
    );
  }

  list(): StoredCustomer[] {
    return [...this.db.customers.values()];
  }

  findByPhone(phone: string): StoredCustomer | null {
    return (
      [...this.db.customers.values()].find(
        (customer) => customer.phone === phone,
      ) ?? null
    );
  }
}
