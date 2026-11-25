import { Injectable } from '@nestjs/common';
import type {
  LegalDocument as LegalRow,
  LegalDocumentVersion as LegalVersionRow,
} from '@prisma/client';
import type {
  LegalDocument,
  LegalDocumentVersion,
} from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { LegalRepository } from './legal.repository';

function statusOf(row: LegalRow): LegalDocument['status'] {
  if (row.publishedBody !== null && row.publishedBody !== undefined) {
    return 'published';
  }
  return 'draft';
}

function toDomain(row: LegalRow): LegalDocument {
  return {
    slug: row.slug,
    title: row.title,
    body: row.body,
    description: row.description,
    isCustom: row.isCustom,
    stored: true,
    status: statusOf(row),
    publishedTitle: row.publishedTitle,
    publishedBody: row.publishedBody,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    publishedById: row.publishedById,
    unpublishedAt: row.unpublishedAt ? iso(row.unpublishedAt) : null,
    updatedById: row.updatedById,
    updatedAt: iso(row.updatedAt),
  };
}

function versionToDomain(row: LegalVersionRow): LegalDocumentVersion {
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    title: row.title,
    body: row.body,
    publishedById: row.publishedById,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** Prisma legal repository over the LegalDocument model, keyed
 * by slug, with the publish version history alongside. */
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
    const data = {
      title: document.title,
      body: document.body,
      description: document.description,
      isCustom: document.isCustom,
      publishedTitle: document.publishedTitle,
      publishedBody: document.publishedBody,
      publishedAt: document.publishedAt
        ? new Date(document.publishedAt)
        : null,
      publishedById: document.publishedById,
      unpublishedAt: document.unpublishedAt
        ? new Date(document.unpublishedAt)
        : null,
      updatedById: document.updatedById,
    };
    await this.db(tx).legalDocument.upsert({
      where: { slug: document.slug },
      create: { slug: document.slug, ...data },
      update: data,
    });
  }

  async list(tx?: Tx): Promise<LegalDocument[]> {
    const rows = await this.db(tx).legalDocument.findMany({
      orderBy: [{ slug: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async listVersions(
    slug: string,
    tx?: Tx,
  ): Promise<LegalDocumentVersion[]> {
    const rows = await this.db(tx).legalDocumentVersion.findMany({
      where: { slug },
      orderBy: [{ version: 'desc' }],
    });
    return rows.map(versionToDomain);
  }

  async addVersion(
    version: LegalDocumentVersion,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).legalDocumentVersion.create({
      data: {
        id: version.id,
        slug: version.slug,
        version: version.version,
        title: version.title,
        body: version.body,
        publishedById: version.publishedById,
        publishedAt: new Date(version.publishedAt),
      },
    });
  }
}
