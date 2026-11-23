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

  async create(lead: Lead): Promise<Lead> {
    this.db.leads.set(lead.id, lead);
    return lead;
  }

  async save(lead: Lead): Promise<void> {
    this.db.leads.set(lead.id, lead);
  }

  async findById(id: string): Promise<Lead | null> {
    return this.db.leads.get(id) ?? null;
  }

  async list(): Promise<Lead[]> {
    return [...this.db.leads.values()];
  }

  async findOpenForVisitor(visitorId: string): Promise<Lead[]> {
    return (await this.list())
      .filter(
        (lead) =>
          lead.visitorId === visitorId &&
          !isTerminalLeadStatus(lead.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findOpenForCustomer(customerId: string): Promise<Lead[]> {
    return (await this.list())
      .filter(
        (lead) =>
          lead.customerId === customerId &&
          !isTerminalLeadStatus(lead.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendAttempt(attempt: LeadContactAttempt): Promise<LeadContactAttempt> {
    this.db.contactAttempts.push(attempt);
    return attempt;
  }

  async listAttempts(leadId: string): Promise<LeadContactAttempt[]> {
    return this.db.contactAttempts.filter(
      (attempt) => attempt.leadId === leadId,
    );
  }

  async createTask(task: FollowUpTask): Promise<FollowUpTask> {
    this.db.followUpTasks.set(task.id, task);
    return task;
  }

  async saveTask(task: FollowUpTask): Promise<void> {
    this.db.followUpTasks.set(task.id, task);
  }

  async findTask(id: string): Promise<FollowUpTask | null> {
    return this.db.followUpTasks.get(id) ?? null;
  }

  async listTasks(leadId: string): Promise<FollowUpTask[]> {
    return [...this.db.followUpTasks.values()].filter(
      (task) => task.leadId === leadId,
    );
  }

  async appendSuppression(record: SuppressionRecord): Promise<SuppressionRecord> {
    this.db.suppressions.push(record);
    return record;
  }

  async listSuppressions(): Promise<SuppressionRecord[]> {
    return [...this.db.suppressions];
  }
}
