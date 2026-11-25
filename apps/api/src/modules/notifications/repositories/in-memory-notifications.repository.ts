import { Injectable } from '@nestjs/common';
import type { NotificationPreference } from '@dostelo/types';
import {
  InMemoryDatabase,
  type NotificationReadRecord,
} from '../../../store/in-memory.store';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class InMemoryNotificationsRepository extends NotificationsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async listReads(
    adminUserId: string,
  ): Promise<NotificationReadRecord[]> {
    return this.db.notificationReads.filter(
      (record) => record.adminUserId === adminUserId,
    );
  }

  async markRead(adminUserId: string, keys: string[]): Promise<number> {
    let marked = 0;
    for (const key of keys) {
      const exists = this.db.notificationReads.some(
        (record) =>
          record.adminUserId === adminUserId &&
          record.notificationKey === key,
      );
      if (!exists) {
        this.db.notificationReads.push({
          adminUserId,
          notificationKey: key,
          readAt: new Date().toISOString(),
        });
        marked += 1;
      }
    }
    return marked;
  }

  async markUnread(adminUserId: string, keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      const index = this.db.notificationReads.findIndex(
        (record) =>
          record.adminUserId === adminUserId &&
          record.notificationKey === key &&
          !record.hidden,
      );
      if (index >= 0) {
        this.db.notificationReads.splice(index, 1);
        removed += 1;
      }
    }
    return removed;
  }

  async markHidden(adminUserId: string, keys: string[]): Promise<number> {
    let hidden = 0;
    for (const key of keys) {
      const existing = this.db.notificationReads.find(
        (record) =>
          record.adminUserId === adminUserId &&
          record.notificationKey === key,
      );
      if (existing) {
        if (!existing.hidden) {
          existing.hidden = true;
          hidden += 1;
        }
      } else {
        this.db.notificationReads.push({
          adminUserId,
          notificationKey: key,
          readAt: new Date().toISOString(),
          hidden: true,
        });
        hidden += 1;
      }
    }
    return hidden;
  }

  async getPreference(
    adminUserId: string,
  ): Promise<NotificationPreference | null> {
    return this.db.notificationPreferences.get(adminUserId) ?? null;
  }

  async savePreference(
    preference: NotificationPreference,
  ): Promise<void> {
    this.db.notificationPreferences.set(preference.adminUserId, preference);
  }
}
