import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENT_SLUGS,
  type LegalDocument,
  type LegalDocumentSlug,
} from '@dostelo/types';
import type { LegalDocumentUpdate } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { LegalRepository } from './repositories/legal.repository';

/**
 * Legal and compliance documents (admin master structure module
 * 24). Documents are stored as editable records keyed by slug.
 * The migrated storefront's policy views still render their
 * ported legacy text, so a stored document is the prepared
 * source of truth rather than what shoppers see today; the
 * admin page states that, and no endpoint here claims the
 * storefront serves these texts.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly legal: LegalRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private defaultFor(slug: LegalDocumentSlug): LegalDocument {
    return {
      slug,
      title: LEGAL_DOCUMENT_LABELS[slug],
      body: '',
      stored: false,
      updatedById: null,
      updatedAt: null,
    };
  }

  private requireSlug(slug: string): LegalDocumentSlug {
    if (
      !(LEGAL_DOCUMENT_SLUGS as readonly string[]).includes(slug)
    ) {
      throw new BadRequestException(`Unknown legal document: ${slug}`);
    }
    return slug as LegalDocumentSlug;
  }

  async list(): Promise<LegalDocument[]> {
    const stored = await this.legal.list();
    const bySlug = new Map(stored.map((doc) => [doc.slug, doc]));
    return LEGAL_DOCUMENT_SLUGS.map(
      (slug) => bySlug.get(slug) ?? this.defaultFor(slug),
    );
  }

  async get(slug: string): Promise<LegalDocument> {
    const valid = this.requireSlug(slug);
    return (
      (await this.legal.findBySlug(valid)) ?? this.defaultFor(valid)
    );
  }

  async update(
    slug: string,
    dto: LegalDocumentUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<LegalDocument> {
    const valid = this.requireSlug(slug);
    const document: LegalDocument = {
      slug: valid,
      title: dto.title,
      body: dto.body,
      stored: true,
      updatedById: actor?.id ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.legal.save(document);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'legal.document-updated',
        entityType: 'legal-document',
        entityId: valid,
        metadata: { title: dto.title, bodyLength: dto.body.length },
      });
    }
    return (await this.legal.findBySlug(valid)) ?? document;
  }
}
