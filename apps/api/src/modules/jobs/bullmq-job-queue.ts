import {
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  JobQueue,
  type EnqueueOptions,
  type JobHandler,
} from './job-queue';

const QUEUE_NAME = 'dostelo-jobs';

/**
 * BullMQ JobQueue implementation (docs/BACKEND_AND_DATABASE.md):
 * one queue named dostelo-jobs and one worker, both created
 * lazily on first use from REDIS_URL, dispatching by job name to
 * the processors services registered. Selected in JobsModule
 * when REDIS_URL is set; the in-process queue is the fallback.
 *
 * Mapping notes against the seam's semantics:
 * - BullMQ rejects ':' in a caller-chosen job id, and the seam's
 *   callers use ids such as `recovery-step:<attemptId>`. Ids are
 *   therefore stored with ':' replaced by '__' and translated
 *   back on cancel; the seam-facing id never changes.
 * - Completed and failed jobs are removed immediately
 *   (removeOnComplete/removeOnFail), so cancel of a job that
 *   already ran finds nothing and returns false, as the seam
 *   specifies.
 * - Re-adding a still-pending job id returns the existing job
 *   instead of replacing it (BullMQ deduplication). The seam's
 *   callers schedule each id once and cancel before any
 *   reschedule, so this does not diverge in practice.
 * - A failing processor is logged and swallowed, mirroring the
 *   in-process runner: one bad job never takes down the worker.
 */
@Injectable()
export class BullMqJobQueue extends JobQueue implements OnModuleDestroy {
  private readonly handlers = new Map<string, JobHandler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueRedis: Redis | null = null;
  private workerRedis: Redis | null = null;

  /** BullMQ 6 loads its Redis client as an optional peer, so the
   * API provides its own ioredis instances (one per side, as
   * BullMQ requires separate connections for blocking worker
   * commands). */
  private newConnection(): Redis {
    const client = new Redis(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
      { maxRetriesPerRequest: null },
    );
    client.on('error', (error) => {
      console.error('BullMQ Redis connection error', error);
    });
    return client;
  }

  private ensureQueue(): Queue {
    if (!this.queue) {
      this.queueRedis = this.newConnection();
      this.queue = new Queue(QUEUE_NAME, {
        connection: this.queueRedis,
      });
      this.queue.on('error', (error) => {
        console.error('BullMQ queue error', error);
      });
    }
    return this.queue;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          const handler = this.handlers.get(job.name);
          if (!handler) {
            console.error(
              `Job ${job.name} (${job.id ?? 'unknown'}) has no registered processor`,
            );
            return;
          }
          try {
            await handler(job.data);
          } catch (error) {
            console.error(
              `Job ${job.name} (${job.id ?? 'unknown'}) failed`,
              error,
            );
          }
        },
        { connection: (this.workerRedis = this.newConnection()) },
      );
      this.worker.on('error', (error) => {
        console.error('BullMQ worker error', error);
      });
    }
    return this.worker;
  }

  private sanitize(jobId: string): string {
    return jobId.replace(/:/g, '__');
  }

  registerProcessor<TPayload>(
    name: string,
    handler: JobHandler<TPayload>,
  ): void {
    this.handlers.set(name, handler as JobHandler);
    this.ensureWorker();
  }

  async enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<string> {
    this.ensureWorker();
    const queue = this.ensureQueue();
    const seamId = options.jobId ?? randomUUID();
    await queue.add(name, payload as Record<string, unknown>, {
      delay: Math.max(0, options.delayMs ?? 0),
      jobId: this.sanitize(seamId),
      removeOnComplete: true,
      removeOnFail: true,
    });
    return seamId;
  }

  async cancel(jobId: string): Promise<boolean> {
    const queue = this.ensureQueue();
    const job = await queue.getJob(this.sanitize(jobId));
    if (!job) return false;
    const state = await job.getState();
    if (state === 'active' || state === 'completed' || state === 'failed') {
      return false;
    }
    try {
      await job.remove();
      return true;
    } catch {
      // The job started between the state check and the remove.
      return false;
    }
  }

  async pendingCount(): Promise<number> {
    const counts = await this.ensureQueue().getJobCounts(
      'waiting',
      'delayed',
      'prioritized',
    );
    return (
      (counts.waiting ?? 0) +
      (counts.delayed ?? 0) +
      (counts.prioritized ?? 0)
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    for (const client of [this.workerRedis, this.queueRedis]) {
      if (client) {
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }
    }
    this.workerRedis = null;
    this.queueRedis = null;
  }
}
