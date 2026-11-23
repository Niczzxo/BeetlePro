/**
 * The job queue seam.
 *
 * The target architecture (docs/BACKEND_AND_DATABASE.md) runs
 * background work on Redis plus BullMQ. Every delayed or
 * recurring job in the API goes through this interface instead of
 * ad-hoc setTimeout calls scattered through services. Two
 * implementations exist: an in-process runner driven by timers
 * (the fallback when REDIS_URL is unset, and what the test suite
 * drives) and a BullMQ implementation backed by Redis, selected
 * in JobsModule when REDIS_URL is set. Services only ever call
 * enqueue, registerProcessor and cancel, so the selection is
 * invisible to them.
 *
 * Semantics kept deliberately close to BullMQ's:
 * - enqueue with a delay: the job runs no earlier than the delay.
 * - A job id can be supplied by the caller (BullMQ's jobId) so a
 *   scheduled step can be cancelled deterministically.
 * - cancel removes a pending job; cancelling a job that already
 *   ran (or never existed) returns false and is not an error.
 * - A failing processor is logged and does not take down the
 *   runner or other jobs, mirroring the OrderEventBus rule.
 * - enqueue, cancel and pendingCount are asynchronous because
 *   the BullMQ implementation talks to Redis; the in-process
 *   implementation resolves immediately.
 */

export type JobHandler<TPayload = unknown> = (
  payload: TPayload,
) => Promise<void> | void;

export interface EnqueueOptions {
  /** Milliseconds to wait before the job becomes due. */
  delayMs?: number;
  /** Caller-chosen id (for later cancellation). A random id is
   * generated when omitted. Reusing the id of a still-pending job
   * replaces that job, as BullMQ does. */
  jobId?: string;
}

export abstract class JobQueue {
  /** Registers the processor for a job name. One processor per
   * name; registering again replaces the previous processor. */
  abstract registerProcessor<TPayload>(
    name: string,
    handler: JobHandler<TPayload>,
  ): void;
  /** Enqueues a job and returns its id. */
  abstract enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<string>;
  /** Removes a pending job. Returns false when nothing pending
   * carries that id. */
  abstract cancel(jobId: string): Promise<boolean>;
  /** Number of jobs currently waiting for their time. */
  abstract pendingCount(): Promise<number>;
}
