import type {
  FollowUpTask,
  Lead,
  LeadContactAttempt,
} from '@dostelo/types';
import type { SuppressionRecord } from '../../../store/in-memory.store';

/**
 * Lead persistence seam (Phase 5). The Prisma implementation will
 * map to the Lead, LeadScore, LeadAssignment, FollowUpTask and
 * SuppressionRecord models in the database schema.
 */
export abstract class LeadsRepository {
  abstract create(lead: Lead): Lead;
  abstract save(lead: Lead): void;
  abstract findById(id: string): Lead | null;
  abstract list(): Lead[];
  /** Open (non-terminal) leads for a visitor, newest first. */
  abstract findOpenForVisitor(visitorId: string): Lead[];
  /** Open (non-terminal) leads for a customer, newest first. */
  abstract findOpenForCustomer(customerId: string): Lead[];
  abstract appendAttempt(
    attempt: LeadContactAttempt,
  ): LeadContactAttempt;
  abstract listAttempts(leadId: string): LeadContactAttempt[];
  abstract createTask(task: FollowUpTask): FollowUpTask;
  abstract saveTask(task: FollowUpTask): void;
  abstract findTask(id: string): FollowUpTask | null;
  abstract listTasks(leadId: string): FollowUpTask[];
  abstract appendSuppression(
    record: SuppressionRecord,
  ): SuppressionRecord;
  abstract listSuppressions(): SuppressionRecord[];
}
