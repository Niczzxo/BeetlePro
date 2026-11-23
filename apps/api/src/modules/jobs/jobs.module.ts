import { Module } from '@nestjs/common';
import { BullMqJobQueue } from './bullmq-job-queue';
import { InProcessJobQueue } from './in-process-job-queue';
import { JobQueue } from './job-queue';

/**
 * Job queue module (Phase 6). Binds the JobQueue seam to BullMQ
 * when REDIS_URL is set and to the in-process runner otherwise:
 * the queue is configured once here, and services depend only on
 * the JobQueue abstraction.
 */
@Module({
  providers: [
    {
      provide: JobQueue,
      useClass: process.env.REDIS_URL
        ? BullMqJobQueue
        : InProcessJobQueue,
    },
  ],
  exports: [JobQueue],
})
export class JobsModule {}
