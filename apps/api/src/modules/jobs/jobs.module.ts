import { Module } from '@nestjs/common';
import { InProcessJobQueue } from './in-process-job-queue';
import { JobQueue } from './job-queue';

/**
 * Job queue module (Phase 6). Binds the JobQueue seam to the
 * in-process runner. The BullMQ implementation, when Redis is
 * available, replaces the useClass below and nothing else: the
 * queue is configured once here, and services depend only on the
 * JobQueue abstraction.
 */
@Module({
  providers: [{ provide: JobQueue, useClass: InProcessJobQueue }],
  exports: [JobQueue],
})
export class JobsModule {}
