import { Injectable } from '@nestjs/common';
import type { CustomerNote } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { CrmRepository } from './crm.repository';

@Injectable()
export class InMemoryCrmRepository extends CrmRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async appendNote(note: CustomerNote): Promise<CustomerNote> {
    this.db.customerNotes.push(note);
    return note;
  }

  async listNotes(customerId: string): Promise<CustomerNote[]> {
    return this.db.customerNotes.filter(
      (note) => note.customerId === customerId,
    );
  }
}
