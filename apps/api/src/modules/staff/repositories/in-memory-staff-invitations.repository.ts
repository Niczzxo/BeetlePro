import { Injectable } from '@nestjs/common';
import {
  InMemoryDatabase,
  type StoredStaffInvitation,
} from '../../../store/in-memory.store';
import { StaffInvitationsRepository } from './staff-invitations.repository';

@Injectable()
export class InMemoryStaffInvitationsRepository extends StaffInvitationsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(invitation: StoredStaffInvitation): Promise<void> {
    this.db.staffInvitations.set(invitation.id, { ...invitation });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<StoredStaffInvitation | null> {
    for (const invitation of this.db.staffInvitations.values()) {
      if (invitation.tokenHash === tokenHash) return { ...invitation };
    }
    return null;
  }

  async save(invitation: StoredStaffInvitation): Promise<void> {
    this.db.staffInvitations.set(invitation.id, { ...invitation });
  }
}
