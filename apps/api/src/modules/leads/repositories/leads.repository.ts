import type {
  FollowUpTask,
  Lead,
  LeadContactAttempt,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';
import type { SuppressionRecord } from '../../../store/in-memory.store';

/**
 * Lead persistence seam (Phase 5). The Prisma implementation maps
 * to the Lead, LeadScore, LeadAssignment, FollowUpTask and
 * SuppressionRecord models in the database schema.
 */
export abstract class LeadsRepository {
  abstract create(lead: Lead, tx?: Tx): Promise<Lead>;
  abstract save(lead: Lead, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Lead | null>;
  abstract list(tx?: Tx): Promise<Lead[]>;
  /** Open (non-terminal) leads for a visitor, newest first. */
  abstract findOpenForVisitor(
    visitorId: string,
    tx?: Tx,
  ): Promise<Lead[]>;
  /** Open (non-terminal) leads for a customer, newest first. */
  abstract findOpenForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<Lead[]>;
  abstract appendAttempt(
    attempt: LeadContactAttempt,
    tx?: Tx,
  ): Promise<LeadContactAttempt>;
  abstract listAttempts(
    leadId: string,
    tx?: Tx,
  ): Promise<LeadContactAttempt[]>;
  abstract createTask(task: FollowUpTask, tx?: Tx): Promise<FollowUpTask>;
  abstract saveTask(task: FollowUpTask, tx?: Tx): Promise<void>;
  abstract findTask(id: string, tx?: Tx): Promise<FollowUpTask | null>;
  abstract listTasks(
    leadId: string,
    tx?: Tx,
  ): Promise<FollowUpTask[]>;
  abstract appendSuppression(
    record: SuppressionRecord,
    tx?: Tx,
  ): Promise<SuppressionRecord>;
  abstract listSuppressions(tx?: Tx): Promise<SuppressionRecord[]>;
}
