import { Injectable } from '@nestjs/common';
import type { AutomationExecution } from '@dostelo/types';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import {
  AutomationExecutionsRepository,
  type AutomationExecutionFilter,
} from './automation-executions.repository';

/** Prisma automation execution log over the AutomationExecution
 * model. Append-only, like the in-memory binding. */
@Injectable()
export class PrismaAutomationExecutionsRepository extends AutomationExecutionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async append(
    execution: AutomationExecution,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).automationExecution.create({
      data: {
        id: execution.id,
        workflowKey: execution.workflowKey,
        entityType: execution.entityType,
        entityId: execution.entityId,
        status: execution.status,
        detail: execution.detail,
        startedAt: new Date(execution.startedAt),
        completedAt: new Date(execution.completedAt),
      },
    });
  }

  async list(
    filter: AutomationExecutionFilter,
    tx?: Tx,
  ): Promise<AutomationExecution[]> {
    const rows = await this.db(tx).automationExecution.findMany({
      where: {
        workflowKey: filter.workflowKey,
        status: filter.status,
        startedAt: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined,
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit ?? 500,
    });
    return rows.map((row) => ({
      id: row.id,
      workflowKey: row.workflowKey,
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.status as AutomationExecution['status'],
      detail: row.detail,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt.toISOString(),
    }));
  }
}
