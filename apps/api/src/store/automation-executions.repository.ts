import type { AutomationExecution } from '@dostelo/types';
import type { Tx } from '../prisma/prisma.service';

export interface AutomationExecutionFilter {
  workflowKey?: string;
  status?: 'success' | 'failed';
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Automation execution log seam (Automation redesign). The
 * flows themselves append one record per run; the Automation
 * module reads them back for counts, success rates and the
 * execution history. The log starts at the deployment that
 * introduces it: earlier runs were never recorded and are not
 * backfilled. Registered globally, like the settings
 * repository, so any subsystem can write without import cycles.
 */
export abstract class AutomationExecutionsRepository {
  abstract append(
    execution: AutomationExecution,
    tx?: Tx,
  ): Promise<void>;
  abstract list(
    filter: AutomationExecutionFilter,
    tx?: Tx,
  ): Promise<AutomationExecution[]>;
}
