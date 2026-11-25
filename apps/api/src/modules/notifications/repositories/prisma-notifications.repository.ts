import { Injectable } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationPreference,
} from '@dostelo/types';
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
      hidden: row.hidden,
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

  async markUnread(
    adminUserId: string,
    keys: string[],
    tx?: Tx,
  ): Promise<number> {
    const result = await this.db(tx).notificationRead.deleteMany({
      where: { adminUserId, notificationKey: { in: keys }, hidden: false },
    });
    return result.count;
  }

  async markHidden(
    adminUserId: string,
    keys: string[],
    tx?: Tx,
  ): Promise<number> {
    const db = this.db(tx);
    let hidden = 0;
    for (const key of keys) {
      await db.notificationRead.upsert({
        where: {
          adminUserId_notificationKey: { adminUserId, notificationKey: key },
        },
        create: { adminUserId, notificationKey: key, hidden: true },
        update: { hidden: true },
      });
      hidden += 1;
    }
    return hidden;
  }

  async getPreference(
    adminUserId: string,
    tx?: Tx,
  ): Promise<NotificationPreference | null> {
    const row = await this.db(tx).notificationPreference.findUnique({
      where: { adminUserId },
    });
    if (!row) return null;
    return {
      adminUserId: row.adminUserId,
      categories: (row.categories as NotificationCategory[]) ?? [],
      emailEnabled: row.emailEnabled,
    };
  }

  async savePreference(
    preference: NotificationPreference,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).notificationPreference.upsert({
      where: { adminUserId: preference.adminUserId },
      create: {
        adminUserId: preference.adminUserId,
        categories: preference.categories,
        emailEnabled: preference.emailEnabled,
      },
      update: {
        categories: preference.categories,
        emailEnabled: preference.emailEnabled,
      },
    });
  }
}
