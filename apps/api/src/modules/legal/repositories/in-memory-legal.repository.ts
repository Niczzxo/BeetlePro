import { Injectable } from '@nestjs/common';
import type {
  LegalDocument,
  LegalDocumentVersion,
} from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { LegalRepository } from './legal.repository';

@Injectable()
export class InMemoryLegalRepository extends LegalRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findBySlug(slug: string): Promise<LegalDocument | null> {
    const doc = this.db.legalDocuments.get(slug);
    return doc ? { ...doc } : null;
  }

  async save(document: LegalDocument): Promise<void> {
    this.db.legalDocuments.set(document.slug, { ...document });
  }

  async list(): Promise<LegalDocument[]> {
    return [...this.db.legalDocuments.values()].map((doc) => ({
      ...doc,
    }));
  }

  async listVersions(slug: string): Promise<LegalDocumentVersion[]> {
    return this.db.legalVersions
      .filter((version) => version.slug === slug)
      .map((version) => ({ ...version }));
  }

  async addVersion(version: LegalDocumentVersion): Promise<void> {
    this.db.legalVersions.push({ ...version });
  }
}
