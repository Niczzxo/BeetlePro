import { Injectable } from '@nestjs/common';
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
}
