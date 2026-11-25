import { Injectable } from '@nestjs/common';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredStaffInvitation } from '../../../store/in-memory.store';
import { StaffInvitationsRepository } from './staff-invitations.repository';

@Injectable()
export class PrismaStaffInvitationsRepository extends StaffInvitationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(invitation: StoredStaffInvitation, tx?: Tx): Promise<void> {
    await this.db(tx).staffInvitation.create({
      data: {
        id: invitation.id,
        adminUserId: invitation.adminUserId,
        tokenHash: invitation.tokenHash,
        expiresAt: new Date(invitation.expiresAt),
        usedAt: invitation.usedAt ? new Date(invitation.usedAt) : null,
        createdAt: new Date(invitation.createdAt),
      },
    });
  }

  async findByTokenHash(
    tokenHash: string,
    tx?: Tx,
  ): Promise<StoredStaffInvitation | null> {
    const row = await this.db(tx).staffInvitation.findUnique({
      where: { tokenHash },
    });
    if (!row) return null;
    return {
      id: row.id,
      adminUserId: row.adminUserId,
      tokenHash: row.tokenHash,
      expiresAt: iso(row.expiresAt),
      usedAt: row.usedAt ? iso(row.usedAt) : null,
      createdAt: iso(row.createdAt),
    };
  }

  async save(invitation: StoredStaffInvitation, tx?: Tx): Promise<void> {
    await this.db(tx).staffInvitation.update({
      where: { id: invitation.id },
      data: {
        usedAt: invitation.usedAt ? new Date(invitation.usedAt) : null,
        expiresAt: new Date(invitation.expiresAt),
      },
    });
  }
}
