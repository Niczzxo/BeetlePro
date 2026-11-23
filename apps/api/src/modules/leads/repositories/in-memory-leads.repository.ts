import { Injectable } from '@nestjs/common';
import type {
  FollowUpTask,
  Lead,
  LeadContactAttempt,
} from '@dostelo/types';
import {
  InMemoryDatabase,
  type SuppressionRecord,
} from '../../../store/in-memory.store';
import { isTerminalLeadStatus } from '../policies/lead-flow';
import { LeadsRepository } from './leads.repository';

@Injectable()
export class InMemoryLeadsRepository extends LeadsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(lead: Lead): Lead {
    this.db.leads.set(lead.id, lead);
    return lead;
  }

  save(lead: Lead): void {
    this.db.leads.set(lead.id, lead);
  }

  findById(id: string): Lead | null {
    return this.db.leads.get(id) ?? null;
  }

  list(): Lead[] {
    return [...this.db.leads.values()];
  }

  findOpenForVisitor(visitorId: string): Lead[] {
    return this.list()
      .filter(
        (lead) =>
          lead.visitorId === visitorId &&
          !isTerminalLeadStatus(lead.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findOpenForCustomer(customerId: string): Lead[] {
    return this.list()
      .filter(
        (lead) =>
          lead.customerId === customerId &&
          !isTerminalLeadStatus(lead.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  appendAttempt(attempt: LeadContactAttempt): LeadContactAttempt {
    this.db.contactAttempts.push(attempt);
    return attempt;
  }

  listAttempts(leadId: string): LeadContactAttempt[] {
    return this.db.contactAttempts.filter(
      (attempt) => attempt.leadId === leadId,
    );
  }

  createTask(task: FollowUpTask): FollowUpTask {
    this.db.followUpTasks.set(task.id, task);
    return task;
  }

  saveTask(task: FollowUpTask): void {
    this.db.followUpTasks.set(task.id, task);
  }

  findTask(id: string): FollowUpTask | null {
    return this.db.followUpTasks.get(id) ?? null;
  }

  listTasks(leadId: string): FollowUpTask[] {
    return [...this.db.followUpTasks.values()].filter(
      (task) => task.leadId === leadId,
    );
  }

  appendSuppression(record: SuppressionRecord): SuppressionRecord {
    this.db.suppressions.push(record);
    return record;
  }

  listSuppressions(): SuppressionRecord[] {
    return [...this.db.suppressions];
  }
}
