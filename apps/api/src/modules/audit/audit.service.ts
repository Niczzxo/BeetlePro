import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AdminRole,
  AuditActorType,
  AuditLogEntry,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  AuditRepository,
  type AuditFilter,
} from './repositories/audit.repository';

export interface AuditRecordInput {
  actorType: AuditActorType;
  actorId: string | null;
  actorRole?: AdminRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * The audit trail writer and reader. Every sensitive action in
 * the API records through here: auth outcomes, order status
 * transitions, payment verify and refund actions, inventory
 * adjustments and MFA changes. Recording is synchronous with the
 * action it describes, so a completed action always has its
 * entry.
 */
@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(input: AuditRecordInput): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      actorType: input.actorType,
      actorId: input.actorId,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.audit.append(entry);
    return entry;
  }

  /** Records an action taken by the token principal, mapping the
   * principal onto the audit actor fields. */
  async recordForPrincipal(
    principal: AuthPrincipal,
    input: Omit<AuditRecordInput, 'actorType' | 'actorId' | 'actorRole'>,
  ): Promise<AuditLogEntry> {
    return this.record({
      ...input,
      actorType: principal.type,
      actorId: principal.id,
      actorRole: principal.roles[0] ?? null,
    });
  }

  async list(filter: AuditFilter): Promise<AuditLogEntry[]> {
    return this.audit.list(filter);
  }
}
