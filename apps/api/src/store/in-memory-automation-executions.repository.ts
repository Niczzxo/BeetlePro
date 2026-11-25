import { Injectable } from '@nestjs/common';
import type { AutomationExecution } from '@dostelo/types';
import { InMemoryDatabase } from './in-memory.store';
import {
  AutomationExecutionsRepository,
  type AutomationExecutionFilter,
} from './automation-executions.repository';

@Injectable()
export class InMemoryAutomationExecutionsRepository extends AutomationExecutionsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async append(execution: AutomationExecution): Promise<void> {
    this.db.automationExecutions.push(execution);
  }

  async list(
    filter: AutomationExecutionFilter,
  ): Promise<AutomationExecution[]> {
    return this.db.automationExecutions
      .filter((execution) => {
        if (
          filter.workflowKey &&
          execution.workflowKey !== filter.workflowKey
        ) {
          return false;
        }
        if (filter.status && execution.status !== filter.status) {
          return false;
        }
        if (filter.from && execution.startedAt < filter.from) {
          return false;
        }
        if (filter.to && execution.startedAt > filter.to) return false;
        return true;
      })
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, filter.limit ?? 500);
  }
}
