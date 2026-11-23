import { Injectable } from '@nestjs/common';
import type { CustomerNote } from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { CrmRepository } from './crm.repository';

/** Prisma CRM repository over the CustomerNote model. */
@Injectable()
export class PrismaCrmRepository extends CrmRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async appendNote(note: CustomerNote, tx?: Tx): Promise<CustomerNote> {
    const row = await this.db(tx).customerNote.create({
      data: {
        id: note.id,
        customerId: note.customerId,
        body: note.body,
        authorId: note.authorId,
        createdAt: new Date(note.createdAt),
      },
    });
    return {
      id: row.id,
      customerId: row.customerId,
      body: row.body,
      authorId: row.authorId,
      createdAt: iso(row.createdAt),
    };
  }

  async listNotes(customerId: string, tx?: Tx): Promise<CustomerNote[]> {
    const rows = await this.db(tx).customerNote.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      body: row.body,
      authorId: row.authorId,
      createdAt: iso(row.createdAt),
    }));
  }
}
