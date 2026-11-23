import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportRepository } from './repositories/support.repository';
import { InMemorySupportRepository } from './repositories/in-memory-support.repository';
import { PrismaSupportRepository } from './repositories/prisma-support.repository';

/**
 * Support module: staff-created support tickets with a reply and
 * internal-note log, assignment and status handling.
 */
@Module({
  imports: [CustomersModule, AuditModule],
  controllers: [SupportController],
  providers: [
    SupportService,
    {
      provide: SupportRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaSupportRepository
        : InMemorySupportRepository,
    },
  ],
  exports: [SupportService, SupportRepository],
})
export class SupportModule {}
