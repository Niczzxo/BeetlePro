import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Customer } from '@dostelo/types';
import type {
  CheckoutCustomer,
  CustomerRegistration,
} from '@dostelo/validation';
import { hashPassword, verifyPassword } from '../../common/password';
import type { StoredCustomer } from '../../store/in-memory.store';
import { CustomersRepository } from './repositories/customers.repository';

/**
 * Customer accounts. Registration and profiles live here; the
 * Phase 4 auth module verifies credentials against the
 * passwordHash stored by register() using verifyPassword from
 * common/password (see verifyCredentials below).
 */
@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomersRepository) {}

  private toPublic(customer: StoredCustomer): Customer {
    const { passwordHash: _passwordHash, ...publicCustomer } = customer;
    return publicCustomer;
  }

  async register(dto: CustomerRegistration): Promise<Customer> {
    if (dto.email && this.customers.findByEmail(dto.email)) {
      throw new ConflictException('A customer with this email exists');
    }
    if (dto.phone && this.customers.findByPhone(dto.phone)) {
      throw new ConflictException('A customer with this phone exists');
    }
    const now = new Date().toISOString();
    const customer: StoredCustomer = {
      id: randomUUID(),
      // The linked auth identity (User) is created by the Phase 4
      // auth module; registration here creates the customer profile.
      userId: null,
      fullName: dto.fullName,
      email: dto.email ?? null,
      phone: dto.phone ?? '',
      isPhoneVerified: false,
      isEmailVerified: false,
      addresses: [],
      tags: [],
      orderCount: 0,
      lifetimeValueMinor: 0,
      passwordHash: await hashPassword(dto.password),
      createdAt: now,
      updatedAt: now,
    };
    this.customers.create(customer);
    return this.toPublic(customer);
  }

  getProfile(id: string): Customer {
    const customer = this.customers.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${id}`);
    }
    return this.toPublic(customer);
  }

  /**
   * Staff customer list for the admin CRM page (Phase 4, chunk 2).
   * Newest first, with an optional case-insensitive search across
   * name, email and phone, and a bounded limit. Password hashes
   * never leave the module: results pass through toPublic.
   */
  listStaff(options: { search?: string; limit?: number } = {}): Customer[] {
    const needle = options.search?.trim().toLowerCase();
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    return this.customers
      .list()
      .filter((customer) => {
        if (!needle) return true;
        return (
          customer.fullName.toLowerCase().includes(needle) ||
          (customer.email?.toLowerCase().includes(needle) ?? false) ||
          customer.phone.includes(needle)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((customer) => this.toPublic(customer));
  }

  /** Internal lookup returning the stored record, for checkout. */
  findStored(id: string): StoredCustomer {
    const customer = this.customers.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${id}`);
    }
    return customer;
  }

  /**
   * Checkout identity: an existing customer matched by phone (then
   * email), or a new passwordless customer created from the checkout
   * contact details. Mirrors the storefront rule that orders belong
   * to a customer record; account claiming arrives with Phase 4.
   */
  findOrCreateForCheckout(details: CheckoutCustomer): StoredCustomer {
    const byPhone = this.customers.findByPhone(details.phone);
    if (byPhone) return byPhone;
    if (details.email) {
      const byEmail = this.customers.findByEmail(details.email);
      if (byEmail) return byEmail;
    }
    const now = new Date().toISOString();
    const customer: StoredCustomer = {
      id: randomUUID(),
      userId: null,
      fullName: details.fullName,
      email: details.email ?? null,
      phone: details.phone,
      isPhoneVerified: false,
      isEmailVerified: false,
      addresses: [],
      tags: [],
      orderCount: 0,
      lifetimeValueMinor: 0,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.create(customer);
    return customer;
  }

  /** Internal lookups returning stored records, for checkout. */
  findStoredByPhone(phone: string): StoredCustomer | null {
    return this.customers.findByPhone(phone);
  }

  findStoredByEmail(email: string): StoredCustomer | null {
    return this.customers.findByEmail(email);
  }

  /** Stored record for an email or phone identifier, for auth. */
  findStoredByIdentifier(identifier: string): StoredCustomer | null {
    return identifier.includes('@')
      ? this.customers.findByEmail(identifier)
      : this.customers.findByPhone(identifier);
  }

  /**
   * Credential check for Phase 4 login: resolves the identifier,
   * then verifies the password against the scrypt hash stored at
   * registration. Passwordless checkout-created customers (null
   * hash) can never pass, by design.
   */
  async verifyCredentials(
    identifier: string,
    password: string,
  ): Promise<StoredCustomer | null> {
    const customer = this.findStoredByIdentifier(identifier);
    if (!customer || !customer.passwordHash) return null;
    const ok = await verifyPassword(password, customer.passwordHash);
    return ok ? customer : null;
  }

  /** Records a placed order against the customer, as the storefront
   * does per account: order count drives the first-order offer. */
  recordOrder(customerId: string, totalMinor: number): void {
    const customer = this.customers.findById(customerId);
    if (!customer) return;
    customer.orderCount += 1;
    customer.lifetimeValueMinor += totalMinor;
    customer.updatedAt = new Date().toISOString();
    this.customers.save(customer);
  }
}
