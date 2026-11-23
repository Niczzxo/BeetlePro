import {
  Injectable,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  JobQueue,
  type EnqueueOptions,
  type JobHandler,
} from './job-queue';

interface ScheduledJob {
  id: string;
  name: string;
  payload: unknown;
  runAt: number;
}

/**
 * In-process JobQueue implementation: jobs live in a map and a
 * single timer is armed for the earliest due time. Timers are
 * unref'd so a pending recovery step never keeps a test process
 * or a shutting-down API alive.
 *
 * The clock is injectable so tests drive time explicitly:
 * construct with a fake now(), enqueue with delays, advance the
 * fake clock and await runDue(). No test sleeps real minutes.
 */
@Injectable()
export class InProcessJobQueue
  extends JobQueue
  implements OnModuleDestroy
{
  private readonly handlers = new Map<string, JobHandler>();
  private readonly jobs = new Map<string, ScheduledJob>();
  private timer: NodeJS.Timeout | null = null;

  /**
   * The clock is optional for Nest DI (which cannot provide a
   * function): production gets Date.now, tests pass a fake.
   */
  constructor(
    @Optional() private readonly now: () => number = () => Date.now(),
  ) {
    super();
  }

  registerProcessor<TPayload>(
    name: string,
    handler: JobHandler<TPayload>,
  ): void {
    this.handlers.set(name, handler as JobHandler);
  }

  enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): string {
    const id = options.jobId ?? randomUUID();
    this.jobs.set(id, {
      id,
      name,
      payload,
      runAt: this.now() + Math.max(0, options.delayMs ?? 0),
    });
    this.armTimer();
    return id;
  }

  cancel(jobId: string): boolean {
    const removed = this.jobs.delete(jobId);
    if (removed) this.armTimer();
    return removed;
  }

  pendingCount(): number {
    return this.jobs.size;
  }

  /** Pending jobs in due order. Exposed for tests and ops. */
  pending(): ScheduledJob[] {
    return [...this.jobs.values()].sort((a, b) => a.runAt - b.runAt);
  }

  /**
   * Runs every job due at or before the given time (default: the
   * queue clock's now), in due order, and returns how many ran.
   * Jobs enqueued by a running handler are picked up by the same
   * pass when already due, so a zero-delay chain drains fully.
   */
  async runDue(atMs: number = this.now()): Promise<number> {
    let ran = 0;
    for (;;) {
      const due = this.pending().filter((job) => job.runAt <= atMs);
      if (due.length === 0) break;
      for (const job of due) {
        // A handler earlier in this pass may have cancelled it.
        if (!this.jobs.delete(job.id)) continue;
        ran += 1;
        const handler = this.handlers.get(job.name);
        if (!handler) {
          console.error(
            `Job ${job.name} (${job.id}) has no registered processor`,
          );
          continue;
        }
        try {
          await handler(job.payload);
        } catch (error) {
          console.error(`Job ${job.name} (${job.id}) failed`, error);
        }
      }
    }
    this.armTimer();
    return ran;
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.jobs.clear();
  }

  private armTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const next = this.pending()[0];
    if (!next) return;
    const wait = Math.max(0, next.runAt - this.now());
    this.timer = setTimeout(() => {
      void this.runDue();
    }, wait);
    this.timer.unref?.();
  }
}
