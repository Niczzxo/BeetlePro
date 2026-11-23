import { Injectable } from '@nestjs/common';
import type { Session as SessionRow } from '@prisma/client';
import { date, iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredSession } from '../../../store/in-memory.store';
import { SessionsRepository } from './sessions.repository';

/**
 * Prisma refresh-token session repository over the Session
 * model. The schema stores the token hash in `token`, the
 * rotation family in `familyId`, the rotation successor in
 * `replacedById`, and the owner as a User row: the domain's
 * subjectType and subjectId resolve through the AdminUser or
 * Customer profile linked to that user.
 */
@Injectable()
export class PrismaSessionsRepository extends SessionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private async toStored(
    row: SessionRow,
    tx?: Tx,
  ): Promise<StoredSession> {
    const db = this.db(tx);
    const admin = await db.adminUser.findUnique({
      where: { userId: row.userId },
    });
    if (admin) {
      return {
        id: row.id,
        subjectType: 'admin',
        subjectId: admin.id,
        familyId: row.familyId ?? row.id,
        refreshTokenHash: row.token,
        replacedById: row.replacedById,
        revokedAt: row.revokedAt ? iso(row.revokedAt) : null,
        expiresAt: iso(row.expiresAt),
        createdAt: iso(row.createdAt),
      };
    }
    const customer = await db.customer.findUnique({
      where: { userId: row.userId },
    });
    if (!customer) {
      throw new Error(
        `Session ${row.id} references user ${row.userId} with no admin or customer profile`,
      );
    }
    return {
      id: row.id,
      subjectType: 'customer',
      subjectId: customer.id,
      familyId: row.familyId ?? row.id,
      refreshTokenHash: row.token,
      replacedById: row.replacedById,
      revokedAt: row.revokedAt ? iso(row.revokedAt) : null,
      expiresAt: iso(row.expiresAt),
      createdAt: iso(row.createdAt),
    };
  }

  private async userIdFor(session: StoredSession, tx?: Tx): Promise<string> {
    const db = this.db(tx);
    if (session.subjectType === 'admin') {
      const admin = await db.adminUser.findUnique({
        where: { id: session.subjectId },
      });
      if (!admin) {
        throw new Error(
          `Cannot store a session for unknown admin ${session.subjectId}`,
        );
      }
      return admin.userId;
    }
    const customer = await db.customer.findUnique({
      where: { id: session.subjectId },
    });
    if (!customer || customer.userId === null) {
      throw new Error(
        `Cannot store a session for customer ${session.subjectId} without a linked user`,
      );
    }
    return customer.userId;
  }

  async create(session: StoredSession, tx?: Tx): Promise<void> {
    await this.db(tx).session.create({
      data: {
        id: session.id,
        userId: await this.userIdFor(session, tx),
        token: session.refreshTokenHash,
        familyId: session.familyId,
        replacedById: session.replacedById,
        revokedAt: session.revokedAt ? date(session.revokedAt) : null,
        expiresAt: date(session.expiresAt),
        createdAt: date(session.createdAt),
      },
    });
  }

  async save(session: StoredSession, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.session.findUnique({
      where: { id: session.id },
    });
    if (!existing) {
      await this.create(session, tx);
      return;
    }
    await db.session.update({
      where: { id: session.id },
      data: {
        token: session.refreshTokenHash,
        familyId: session.familyId,
        replacedById: session.replacedById,
        revokedAt: session.revokedAt ? date(session.revokedAt) : null,
        expiresAt: date(session.expiresAt),
      },
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<StoredSession | null> {
    const row = await this.db(tx).session.findUnique({ where: { id } });
    return row ? this.toStored(row, tx) : null;
  }

  async findByRefreshHash(
    hash: string,
    tx?: Tx,
  ): Promise<StoredSession | null> {
    const row = await this.db(tx).session.findUnique({
      where: { token: hash },
    });
    return row ? this.toStored(row, tx) : null;
  }

  async listByFamily(
    familyId: string,
    tx?: Tx,
  ): Promise<StoredSession[]> {
    const rows = await this.db(tx).session.findMany({
      where: { familyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const stored: StoredSession[] = [];
    for (const row of rows) {
      stored.push(await this.toStored(row, tx));
    }
    return stored;
  }
}
