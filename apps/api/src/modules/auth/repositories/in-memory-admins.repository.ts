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

  async create(admin: StoredAdminUser): Promise<StoredAdminUser> {
    this.db.adminUsers.set(admin.id, admin);
    return admin;
  }

  async save(admin: StoredAdminUser): Promise<void> {
    this.db.adminUsers.set(admin.id, admin);
  }

  async findById(id: string): Promise<StoredAdminUser | null> {
    return this.db.adminUsers.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<StoredAdminUser | null> {
    const needle = email.toLowerCase();
    return (
      [...this.db.adminUsers.values()].find(
        (admin) => admin.email.toLowerCase() === needle,
      ) ?? null
    );
  }

  async list(): Promise<StoredAdminUser[]> {
    return [...this.db.adminUsers.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async count(): Promise<number> {
    return this.db.adminUsers.size;
  }
}
