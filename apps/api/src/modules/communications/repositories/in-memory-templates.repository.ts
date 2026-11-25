import { Injectable } from '@nestjs/common';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  TemplatesRepository,
  type StoredMessageTemplate,
} from './templates.repository';

@Injectable()
export class InMemoryTemplatesRepository extends TemplatesRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async listStored(): Promise<StoredMessageTemplate[]> {
    return [...this.db.messageTemplates.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }

  async findStored(key: string): Promise<StoredMessageTemplate | null> {
    return this.db.messageTemplates.get(key) ?? null;
  }

  async upsertStored(
    template: StoredMessageTemplate,
  ): Promise<StoredMessageTemplate> {
    this.db.messageTemplates.set(template.key, template);
    return template;
  }

  async removeStored(key: string): Promise<boolean> {
    return this.db.messageTemplates.delete(key);
  }
}
