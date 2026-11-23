import { Injectable } from '@nestjs/common';
import {
  InMemoryDatabase,
  type StoredAdminUser,
} from '../../../store/in-memory.store';
import { AdminsRepository } from './admins.repository';

@Injectable()
export class InMemoryAdminsRepository extends AdminsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(admin: StoredAdminUser): StoredAdminUser {
    this.db.adminUsers.set(admin.id, admin);
    return admin;
  }

  save(admin: StoredAdminUser): void {
    this.db.adminUsers.set(admin.id, admin);
  }

  findById(id: string): StoredAdminUser | null {
    return this.db.adminUsers.get(id) ?? null;
  }

  findByEmail(email: string): StoredAdminUser | null {
    const needle = email.toLowerCase();
    return (
      [...this.db.adminUsers.values()].find(
        (admin) => admin.email.toLowerCase() === needle,
      ) ?? null
    );
  }

  count(): number {
    return this.db.adminUsers.size;
  }
}
