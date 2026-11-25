import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './repositories/catalog.repository';
import { InMemoryCatalogRepository } from './repositories/in-memory-catalog.repository';
import { PrismaCatalogRepository } from './repositories/prisma-catalog.repository';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [
    CatalogService,
    { provide: CatalogRepository, useClass: process.env.DATABASE_URL ? PrismaCatalogRepository : InMemoryCatalogRepository },
  ],
  exports: [CatalogService, CatalogRepository],
})
export class CatalogModule {}
