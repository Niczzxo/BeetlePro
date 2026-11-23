import { Injectable } from '@nestjs/common';
import type {
  FollowUpTask,
  Lead,
  LeadContactAttempt,
  LeadStatus,
} from '@dostelo/types';
import type {
  FollowUpTask as FollowUpTaskRow,
  Lead as LeadRow,
  LeadContactAttempt as LeadContactAttemptRow,
  SuppressionRecord as SuppressionRow,
} from '@prisma/client';
import { date, fromEnum, iso, toEnum } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { SuppressionRecord } from '../../../store/in-memory.store';
import { isTerminalLeadStatus } from '../policies/lead-flow';
import { LeadsRepository } from './leads.repository';

const TERMINAL_STATUSES: LeadStatus[] = [
  'converted',
  'lost',
  'do-not-contact',
];

/** Prisma leads repository over Lead, LeadContactAttempt,
 * FollowUpTask and SuppressionRecord. */
@Injectable()
export class PrismaLeadsRepository extends LeadsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toLead(row: LeadRow): Lead {
    return {
      id: row.id,
      status: fromEnum(row.status),
      source: fromEnum(row.source),
      visitorId: row.visitorId,
      sessionId: row.sessionId,
      customerId: row.customerId,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      score: row.score,
      contactBasis: row.contactBasis as Lead['contactBasis'],
      assigneeId: row.assigneeId,
      optedOut: row.optedOut,
      optedOutAt: row.optedOutAt ? iso(row.optedOutAt) : null,
      note: row.note,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private leadData(lead: Lead) {
    return {
      status: toEnum<LeadRow['status']>(lead.status),
      source: toEnum<LeadRow['source']>(lead.source),
      visitorId: lead.visitorId,
      sessionId: lead.sessionId,
      customerId: lead.customerId,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      score: lead.score,
      contactBasis: lead.contactBasis,
      assigneeId: lead.assigneeId,
      optedOut: lead.optedOut,
      optedOutAt: lead.optedOutAt ? date(lead.optedOutAt) : null,
      note: lead.note,
    };
  }

  async create(lead: Lead, tx?: Tx): Promise<Lead> {
    const row = await this.db(tx).lead.create({
      data: {
        id: lead.id,
        createdAt: date(lead.createdAt),
        ...this.leadData(lead),
      },
    });
    return this.toLead(row);
  }

  async save(lead: Lead, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.lead.findUnique({ where: { id: lead.id } });
    if (!existing) {
      await this.create(lead, tx);
      return;
    }
    await db.lead.update({
      where: { id: lead.id },
      data: this.leadData(lead),
    });
  }

  async findById(id: string, tx?: Tx): Promise<Lead | null> {
    const row = await this.db(tx).lead.findUnique({ where: { id } });
    return row ? this.toLead(row) : null;
  }

  async list(tx?: Tx): Promise<Lead[]> {
    const rows = await this.db(tx).lead.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toLead(row));
  }

  private async findOpen(
    where: { visitorId: string } | { customerId: string },
    tx?: Tx,
  ): Promise<Lead[]> {
    const rows = await this.db(tx).lead.findMany({
      where: {
        ...where,
        status: { notIn: TERMINAL_STATUSES.map((s) => toEnum(s)) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows
      .map((row) => this.toLead(row))
      .filter((lead) => !isTerminalLeadStatus(lead.status));
  }

  async findOpenForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<Lead[]> {
    return this.findOpen({ visitorId }, tx);
  }

  async findOpenForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<Lead[]> {
    return this.findOpen({ customerId }, tx);
  }

  private toAttempt(row: LeadContactAttemptRow): LeadContactAttempt {
    return {
      id: row.id,
      leadId: row.leadId,
      channel: row.channel as LeadContactAttempt['channel'],
      purpose: row.purpose,
      result: row.result as LeadContactAttempt['result'],
      note: row.note,
      staffId: row.staffId,
      optedOut: row.optedOut,
      createdAt: iso(row.createdAt),
    };
  }

  async appendAttempt(
    attempt: LeadContactAttempt,
    tx?: Tx,
  ): Promise<LeadContactAttempt> {
    const row = await this.db(tx).leadContactAttempt.create({
      data: {
        id: attempt.id,
        leadId: attempt.leadId,
        channel: attempt.channel,
        purpose: attempt.purpose,
        result: attempt.result,
        note: attempt.note,
        staffId: attempt.staffId,
        optedOut: attempt.optedOut,
        createdAt: date(attempt.createdAt),
      },
    });
    return this.toAttempt(row);
  }

  async listAttempts(
    leadId: string,
    tx?: Tx,
  ): Promise<LeadContactAttempt[]> {
    const rows = await this.db(tx).leadContactAttempt.findMany({
      where: { leadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toAttempt(row));
  }

  private toTask(row: FollowUpTaskRow): FollowUpTask {
    return {
      id: row.id,
      leadId: row.leadId,
      title: row.title,
      dueAt: row.dueAt ? iso(row.dueAt) : null,
      status: row.status as FollowUpTask['status'],
      createdById: row.createdById,
      completedAt: row.completedAt ? iso(row.completedAt) : null,
      createdAt: iso(row.createdAt),
    };
  }

  private taskData(task: FollowUpTask) {
    return {
      leadId: task.leadId,
      title: task.title,
      dueAt: task.dueAt ? date(task.dueAt) : null,
      status: task.status,
      createdById: task.createdById,
      completedAt: task.completedAt ? date(task.completedAt) : null,
    };
  }

  async createTask(task: FollowUpTask, tx?: Tx): Promise<FollowUpTask> {
    const row = await this.db(tx).followUpTask.create({
      data: {
        id: task.id,
        createdAt: date(task.createdAt),
        ...this.taskData(task),
      },
    });
    return this.toTask(row);
  }

  async saveTask(task: FollowUpTask, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.followUpTask.findUnique({
      where: { id: task.id },
    });
    if (!existing) {
      await this.createTask(task, tx);
      return;
    }
    await db.followUpTask.update({
      where: { id: task.id },
      data: this.taskData(task),
    });
  }

  async findTask(id: string, tx?: Tx): Promise<FollowUpTask | null> {
    const row = await this.db(tx).followUpTask.findUnique({
      where: { id },
    });
    return row ? this.toTask(row) : null;
  }

  async listTasks(leadId: string, tx?: Tx): Promise<FollowUpTask[]> {
    const rows = await this.db(tx).followUpTask.findMany({
      where: { leadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toTask(row));
  }

  private toSuppression(row: SuppressionRow): SuppressionRecord {
    return {
      id: row.id,
      leadId: row.leadId,
      customerId: row.customerId,
      phone: row.phone,
      reason: row.reason,
      createdAt: iso(row.createdAt),
    };
  }

  async appendSuppression(
    record: SuppressionRecord,
    tx?: Tx,
  ): Promise<SuppressionRecord> {
    const row = await this.db(tx).suppressionRecord.create({
      data: {
        id: record.id,
        leadId: record.leadId,
        customerId: record.customerId,
        phone: record.phone,
        reason: record.reason,
        createdAt: date(record.createdAt),
      },
    });
    return this.toSuppression(row);
  }

  async listSuppressions(tx?: Tx): Promise<SuppressionRecord[]> {
    const rows = await this.db(tx).suppressionRecord.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toSuppression(row));
  }
}
