import { Injectable } from '@nestjs/common';
import {
  InMemoryDatabase,
  type StoredSession,
} from '../../../store/in-memory.store';
import { SessionsRepository } from './sessions.repository';

@Injectable()
export class InMemorySessionsRepository extends SessionsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(session: StoredSession): Promise<void> {
    this.db.sessions.set(session.id, session);
  }

  async save(session: StoredSession): Promise<void> {
    this.db.sessions.set(session.id, session);
  }

  async findById(id: string): Promise<StoredSession | null> {
    return this.db.sessions.get(id) ?? null;
  }

  async findByRefreshHash(hash: string): Promise<StoredSession | null> {
    return (
      [...this.db.sessions.values()].find(
        (session) => session.refreshTokenHash === hash,
      ) ?? null
    );
  }

  async listByFamily(familyId: string): Promise<StoredSession[]> {
    return [...this.db.sessions.values()].filter(
      (session) => session.familyId === familyId,
    );
  }
}
