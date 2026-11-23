import { Injectable } from '@nestjs/common';
import type { LegalDocument } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { LegalRepository } from './legal.repository';

@Injectable()
export class InMemoryLegalRepository extends LegalRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findBySlug(slug: string): Promise<LegalDocument | null> {
    return this.db.legalDocuments.get(slug) ?? null;
  }

  async save(document: LegalDocument): Promise<void> {
    this.db.legalDocuments.set(document.slug, document);
  }

  async list(): Promise<LegalDocument[]> {
    return [...this.db.legalDocuments.values()];
  }
}
