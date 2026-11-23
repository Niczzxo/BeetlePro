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

  async create(customer: StoredCustomer): Promise<StoredCustomer> {
    this.db.customers.set(customer.id, customer);
    return customer;
  }

  async save(customer: StoredCustomer): Promise<void> {
    this.db.customers.set(customer.id, customer);
  }

  async findById(id: string): Promise<StoredCustomer | null> {
    return this.db.customers.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<StoredCustomer | null> {
    const needle = email.toLowerCase();
    return (
      [...this.db.customers.values()].find(
        (customer) => customer.email?.toLowerCase() === needle,
      ) ?? null
    );
  }

  async list(): Promise<StoredCustomer[]> {
    return [...this.db.customers.values()];
  }

  async findByPhone(phone: string): Promise<StoredCustomer | null> {
    return (
      [...this.db.customers.values()].find(
        (customer) => customer.phone === phone,
      ) ?? null
    );
  }
}
