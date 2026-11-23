import { describe, expect, it } from 'vitest';
import { InProcessJobQueue } from './in-process-job-queue';

/**
 * The queue seam (Phase 6): enqueue with delay, processor
 * registration, cancellation, and the fake-clock runDue the
 * recovery tests rely on. No test sleeps real time.
 */
describe('InProcessJobQueue', () => {
  it('runs jobs in due order once their delay has passed', async () => {
    let now = 1_000_000;
    const queue = new InProcessJobQueue(() => now);
    const seen: string[] = [];
    queue.registerProcessor('test.job', (payload: { name: string }) => {
      seen.push(payload.name);
    });
    await queue.enqueue('test.job', { name: 'late' }, { delayMs: 120_000 });
    await queue.enqueue('test.job', { name: 'early' }, { delayMs: 60_000 });
    await queue.enqueue('test.job', { name: 'now' });

    expect(await queue.runDue()).toBe(1);
    expect(seen).toEqual(['now']);

    now += 60_000;
    expect(await queue.runDue()).toBe(1);
    expect(seen).toEqual(['now', 'early']);

    now += 60_000;
    expect(await queue.runDue()).toBe(1);
    expect(seen).toEqual(['now', 'early', 'late']);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('cancel removes a pending job and reports false afterwards', async () => {
    let now = 0;
    const queue = new InProcessJobQueue(() => now);
    const seen: string[] = [];
    queue.registerProcessor('test.job', (payload: { name: string }) => {
      seen.push(payload.name);
    });
    const id = await queue.enqueue(
      'test.job',
      { name: 'never' },
      { delayMs: 1000, jobId: 'fixed-id' },
    );
    expect(id).toBe('fixed-id');
    expect(await queue.cancel('fixed-id')).toBe(true);
    expect(await queue.cancel('fixed-id')).toBe(false);
    now += 5000;
    expect(await queue.runDue()).toBe(0);
    expect(seen).toEqual([]);
  });

  it('a failing processor does not stop later jobs', async () => {
    const queue = new InProcessJobQueue(() => 0);
    const seen: string[] = [];
    queue.registerProcessor('test.boom', () => {
      throw new Error('boom');
    });
    queue.registerProcessor('test.ok', (payload: { name: string }) => {
      seen.push(payload.name);
    });
    await queue.enqueue('test.boom', {});
    await queue.enqueue('test.ok', { name: 'after' });
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      expect(await queue.runDue()).toBe(2);
    } finally {
      console.error = original;
    }
    expect(seen).toEqual(['after']);
    expect(errors.length).toBe(1);
  });

  it('jobs enqueued by a handler run in the same pass when due', async () => {
    const queue = new InProcessJobQueue(() => 0);
    const seen: string[] = [];
    queue.registerProcessor('test.chain', (payload: { step: number }) => {
      seen.push(`step-${payload.step}`);
      if (payload.step < 3) {
        void queue.enqueue('test.chain', { step: payload.step + 1 });
      }
    });
    await queue.enqueue('test.chain', { step: 1 });
    expect(await queue.runDue()).toBe(3);
    expect(seen).toEqual(['step-1', 'step-2', 'step-3']);
  });
});
