import { Injectable } from '@nestjs/common';
import type { LegalDocument as LegalRow } from '@prisma/client';
import type { LegalDocument } from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { LegalRepository } from './legal.repository';

function toDomain(row: LegalRow): LegalDocument {
  return {
    slug: row.slug as LegalDocument['slug'],
    title: row.title,
    body: row.body,
    stored: true,
    updatedById: row.updatedById,
    updatedAt: iso(row.updatedAt),
  };
}

/** Prisma legal repository over the LegalDocument model, keyed
 * by slug. */
@Injectable()
export class PrismaLegalRepository extends LegalRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async findBySlug(
    slug: string,
    tx?: Tx,
  ): Promise<LegalDocument | null> {
    const row = await this.db(tx).legalDocument.findUnique({
      where: { slug },
    });
    return row ? toDomain(row) : null;
  }

  async save(document: LegalDocument, tx?: Tx): Promise<void> {
    await this.db(tx).legalDocument.upsert({
      where: { slug: document.slug },
      create: {
        slug: document.slug,
        title: document.title,
        body: document.body,
        updatedById: document.updatedById,
      },
      update: {
        title: document.title,
        body: document.body,
        updatedById: document.updatedById,
      },
    });
  }

  async list(tx?: Tx): Promise<LegalDocument[]> {
    const rows = await this.db(tx).legalDocument.findMany({
      orderBy: [{ slug: 'asc' }],
    });
    return rows.map(toDomain);
  }
}
