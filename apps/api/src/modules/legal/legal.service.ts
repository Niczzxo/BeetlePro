import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  LEGAL_DOCUMENT_DESCRIPTIONS,
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENT_SLUGS,
  type LegalDocument,
  type LegalDocumentVersion,
  type LegalSyncStatus,
  type PublicLegalDocument,
} from '@dostelo/types';
import type {
  LegalDocumentCreate,
  LegalDocumentUpdate,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { LegalRepository } from './repositories/legal.repository';

/**
 * Legal and compliance documents (admin master structure module
 * 24, redesign). Each document has a draft (title and body) and,
 * once published, a published copy. Saving edits the draft only
 * and never implies publishing; publishing copies the draft into
 * the published fields and stores an immutable version;
 * unpublishing withdraws the document from the public endpoint.
 * The public endpoint serves published documents by slug. The
 * Next.js storefront policy routes (shipping, returns,
 * warranty, privacy, terms, refund) render the published
 * document for their slug and fall back to their built-in text
 * when nothing is published. The static GitHub Pages site
 * never reads this API.
 *
 * Permission note: the roles matrix gates this whole module
 * behind settings.manage; it defines no separate publish
 * permission, so editing and publishing share that gate.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly legal: LegalRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private statusOf(
    doc: Pick<LegalDocument, 'stored' | 'publishedBody'>,
  ): LegalDocument['status'] {
    if (!doc.stored) return 'not-saved';
    return doc.publishedBody !== null ? 'published' : 'draft';
  }

  private withStatus(doc: LegalDocument): LegalDocument {
    return { ...doc, status: this.statusOf(doc) };
  }

  private defaultFor(slug: string): LegalDocument {
    return {
      slug,
      title:
        LEGAL_DOCUMENT_LABELS[slug as keyof typeof LEGAL_DOCUMENT_LABELS] ??
        slug,
      body: '',
      description: LEGAL_DOCUMENT_DESCRIPTIONS[slug] ?? '',
      isCustom: false,
      stored: false,
      status: 'not-saved',
      publishedTitle: null,
      publishedBody: null,
      publishedAt: null,
      publishedById: null,
      unpublishedAt: null,
      updatedById: null,
      updatedAt: null,
    };
  }

  private async requireDocument(slug: string): Promise<LegalDocument> {
    const doc = await this.legal.findBySlug(slug);
    if (!doc) {
      if ((LEGAL_DOCUMENT_SLUGS as readonly string[]).includes(slug)) {
        return this.defaultFor(slug);
      }
      throw new NotFoundException(`Legal document not found: ${slug}`);
    }
    return this.withStatus(doc);
  }

  /** Strip script elements from stored content: bodies render
   * as text with paragraph breaks everywhere they are shown, and
   * scripts must never survive into any rendering surface. */
  private sanitize(body: string): string {
    return body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '');
  }

  async list(): Promise<LegalDocument[]> {
    const stored = await this.legal.list();
    const bySlug = new Map(stored.map((doc) => [doc.slug, doc]));
    const defaults = LEGAL_DOCUMENT_SLUGS.map(
      (slug) => bySlug.get(slug) ?? this.defaultFor(slug),
    );
    const customs = stored
      .filter(
        (doc) =>
          !(LEGAL_DOCUMENT_SLUGS as readonly string[]).includes(doc.slug),
      )
      .sort((a, b) => a.slug.localeCompare(b.slug));
    return [...defaults, ...customs].map((doc) => this.withStatus(doc));
  }

  async get(slug: string): Promise<LegalDocument> {
    return this.requireDocument(slug);
  }

  /** Save the draft. Never touches the published copy. */
  async update(
    slug: string,
    dto: LegalDocumentUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const existing = await this.requireDocument(slug);
    const document: LegalDocument = {
      ...existing,
      title: dto.title,
      body: this.sanitize(dto.body),
      stored: true,
      updatedById: actor?.id ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.legal.save(document);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.document-updated',
        entityType: 'legal-document',
        entityId: slug,
        metadata: { title: dto.title, bodyLength: dto.body.length },
      });
    }
    return this.requireDocument(slug);
  }

  /** Add a custom document: a new draft record with its own
   * slug. The six defaults are never altered by this. */
  async create(
    dto: LegalDocumentCreate,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const existing = await this.legal.findBySlug(dto.slug);
    if (
      existing ||
      (LEGAL_DOCUMENT_SLUGS as readonly string[]).includes(dto.slug)
    ) {
      throw new BadRequestException(
        `A legal document with slug ${dto.slug} already exists`,
      );
    }
    const document: LegalDocument = {
      slug: dto.slug,
      title: dto.title,
      body: '',
      description: dto.description ?? '',
      isCustom: true,
      stored: true,
      status: 'draft',
      publishedTitle: null,
      publishedBody: null,
      publishedAt: null,
      publishedById: null,
      unpublishedAt: null,
      updatedById: actor?.id ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.legal.save(document);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.document-created',
        entityType: 'legal-document',
        entityId: dto.slug,
        metadata: { title: dto.title },
      });
    }
    return this.requireDocument(dto.slug);
  }

  /** Publish the current draft and store an immutable version. */
  async publish(
    slug: string,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const doc = await this.requireDocument(slug);
    if (!doc.stored || doc.body.trim().length === 0) {
      throw new BadRequestException(
        `Document ${slug} has no saved content to publish yet`,
      );
    }
    const now = new Date().toISOString();
    const versions = await this.legal.listVersions(slug);
    const version: LegalDocumentVersion = {
      id: randomUUID(),
      slug,
      version: versions.length + 1,
      title: doc.title,
      body: doc.body,
      publishedById: actor?.id ?? null,
      publishedAt: now,
    };
    await this.legal.addVersion(version);
    const published: LegalDocument = {
      ...doc,
      publishedTitle: doc.title,
      publishedBody: doc.body,
      publishedAt: now,
      publishedById: actor?.id ?? null,
    };
    await this.legal.save(published);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.document-published',
        entityType: 'legal-document',
        entityId: slug,
        metadata: { version: version.version },
      });
    }
    return this.requireDocument(slug);
  }

  /** Withdraw the document from the public endpoint. The draft
   * and the version history stay. */
  async unpublish(
    slug: string,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const doc = await this.requireDocument(slug);
    if (doc.publishedBody === null) {
      throw new BadRequestException(`Document ${slug} is not published`);
    }
    const updated: LegalDocument = {
      ...doc,
      publishedTitle: null,
      publishedBody: null,
      publishedAt: null,
      publishedById: null,
      unpublishedAt: new Date().toISOString(),
    };
    await this.legal.save(updated);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.document-unpublished',
        entityType: 'legal-document',
        entityId: slug,
        metadata: {},
      });
    }
    return this.requireDocument(slug);
  }

  async listVersions(slug: string): Promise<LegalDocumentVersion[]> {
    await this.requireDocument(slug);
    const versions = await this.legal.listVersions(slug);
    return versions.sort((a, b) => b.version - a.version);
  }

  /** Restore a version into the DRAFT only. History is never
   * rewritten, and restoring never publishes. */
  async restoreVersion(
    slug: string,
    versionId: string,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const doc = await this.requireDocument(slug);
    const versions = await this.legal.listVersions(slug);
    const version = versions.find((entry) => entry.id === versionId);
    if (!version) {
      throw new NotFoundException(
        `Version not found for ${slug}: ${versionId}`,
      );
    }
    const updated: LegalDocument = {
      ...doc,
      title: version.title,
      body: version.body,
      stored: true,
      updatedById: actor?.id ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.legal.save(updated);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.version-restored-to-draft',
        entityType: 'legal-document',
        entityId: slug,
        metadata: { version: version.version },
      });
    }
    return this.requireDocument(slug);
  }

  /** The public read: the published copy, or null. */
  async getPublic(slug: string): Promise<PublicLegalDocument | null> {
    const doc = await this.legal.findBySlug(slug);
    if (!doc || doc.publishedBody === null || doc.publishedAt === null) {
      return null;
    }
    return {
      slug: doc.slug,
      title: doc.publishedTitle ?? doc.title,
      body: doc.publishedBody,
      publishedAt: doc.publishedAt,
    };
  }

  async listPublic(): Promise<PublicLegalDocument[]> {
    const docs = await this.list();
    const published: PublicLegalDocument[] = [];
    for (const doc of docs) {
      if (doc.publishedBody !== null && doc.publishedAt !== null) {
        published.push({
          slug: doc.slug,
          title: doc.publishedTitle ?? doc.title,
          body: doc.publishedBody,
          publishedAt: doc.publishedAt,
        });
      }
    }
    return published;
  }

  async syncStatus(): Promise<LegalSyncStatus> {
    const docs = await this.list();
    const stamps = docs
      .flatMap((doc) => [doc.publishedAt, doc.unpublishedAt])
      .filter((stamp): stamp is string => stamp !== null)
      .sort();
    return {
      publishedCount: docs.filter((doc) => doc.status === 'published')
        .length,
      totalDocuments: docs.length,
      lastSyncAt: stamps.length > 0 ? stamps[stamps.length - 1]! : null,
      errors: [],
    };
  }
}
