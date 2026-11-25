import { Injectable } from '@nestjs/common';
import type { MessageTemplate as PrismaTemplateRow } from '@prisma/client';
import type { CommunicationChannel } from '@dostelo/types';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { fromEnum, toEnum } from '../../../prisma/prisma.helpers';
import {
  TemplatesRepository,
  type StoredMessageTemplate,
} from './templates.repository';

interface TemplateRow {
  key: string;
  channel: string;
  subject: string | null;
  body: string;
  updatedAt: Date;
}

/**
 * Prisma message templates: staff edits in the MessageTemplate
 * table, keyed by template key. Enum values cross the boundary
 * as plain strings, the same mapping the other Prisma
 * repositories in this module use.
 */
@Injectable()
export class PrismaTemplatesRepository extends TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toStored(row: TemplateRow): StoredMessageTemplate {
    return {
      key: row.key,
      channel: fromEnum(row.channel) as CommunicationChannel,
      subject: row.subject,
      body: row.body,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listStored(tx?: Tx): Promise<StoredMessageTemplate[]> {
    const rows = await this.db(tx).messageTemplate.findMany({
      orderBy: [{ key: 'asc' }],
    });
    return rows.map((row) => this.toStored(row));
  }

  async findStored(
    key: string,
    tx?: Tx,
  ): Promise<StoredMessageTemplate | null> {
    const row = await this.db(tx).messageTemplate.findUnique({
      where: { key },
    });
    return row ? this.toStored(row) : null;
  }

  async upsertStored(
    template: StoredMessageTemplate,
    tx?: Tx,
  ): Promise<StoredMessageTemplate> {
    const row = await this.db(tx).messageTemplate.upsert({
      where: { key: template.key },
      create: {
        key: template.key,
        channel: toEnum<PrismaTemplateRow['channel']>(template.channel),
        subject: template.subject,
        body: template.body,
      },
      update: {
        channel: toEnum<PrismaTemplateRow['channel']>(template.channel),
        subject: template.subject,
        body: template.body,
      },
    });
    return this.toStored(row);
  }

  async removeStored(key: string, tx?: Tx): Promise<boolean> {
    const result = await this.db(tx).messageTemplate.deleteMany({
      where: { key },
    });
    return result.count > 0;
  }
}
