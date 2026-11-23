import { Injectable } from '@nestjs/common';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { NotificationReadRecord } from '../../../store/in-memory.store';
import { NotificationsRepository } from './notifications.repository';

/** Prisma notification read-state over the NotificationRead
 * model, whose (adminUserId, notificationKey) pair is unique. */
@Injectable()
export class PrismaNotificationsRepository extends NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async listReads(
    adminUserId: string,
    tx?: Tx,
  ): Promise<NotificationReadRecord[]> {
    const rows = await this.db(tx).notificationRead.findMany({
      where: { adminUserId },
    });
    return rows.map((row) => ({
      adminUserId: row.adminUserId,
      notificationKey: row.notificationKey,
      readAt: iso(row.readAt),
    }));
  }

  async markRead(
    adminUserId: string,
    keys: string[],
    tx?: Tx,
  ): Promise<number> {
    const db = this.db(tx);
    const existing = await db.notificationRead.findMany({
      where: { adminUserId, notificationKey: { in: keys } },
      select: { notificationKey: true },
    });
    const already = new Set(existing.map((row) => row.notificationKey));
    let marked = 0;
    for (const key of keys) {
      if (already.has(key)) continue;
      await db.notificationRead.create({
        data: { adminUserId, notificationKey: key },
      });
      marked += 1;
    }
    return marked;
  }
}
