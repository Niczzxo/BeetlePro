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

  create(session: StoredSession): void {
    this.db.sessions.set(session.id, session);
  }

  save(session: StoredSession): void {
    this.db.sessions.set(session.id, session);
  }

  findById(id: string): StoredSession | null {
    return this.db.sessions.get(id) ?? null;
  }

  findByRefreshHash(hash: string): StoredSession | null {
    return (
      [...this.db.sessions.values()].find(
        (session) => session.refreshTokenHash === hash,
      ) ?? null
    );
  }

  listByFamily(familyId: string): StoredSession[] {
    return [...this.db.sessions.values()].filter(
      (session) => session.familyId === familyId,
    );
  }
}
