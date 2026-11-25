import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LegalController } from './legal.controller';
import { LegalPublicController } from './legal-public.controller';
import { LegalService } from './legal.service';
import { LegalRepository } from './repositories/legal.repository';
import { InMemoryLegalRepository } from './repositories/in-memory-legal.repository';
import { PrismaLegalRepository } from './repositories/prisma-legal.repository';

/**
 * Legal module: editable legal documents stored per slug, with
 * label defaults for documents staff have not written yet.
 */
@Module({
  imports: [AuditModule],
  controllers: [LegalController, LegalPublicController],
  providers: [
    LegalService,
    {
      provide: LegalRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaLegalRepository
        : InMemoryLegalRepository,
    },
  ],
  exports: [LegalService, LegalRepository],
})
export class LegalModule {}
