import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './repositories/catalog.repository';
import { InMemoryCatalogRepository } from './repositories/in-memory-catalog.repository';
import { PrismaCatalogRepository } from './repositories/prisma-catalog.repository';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    { provide: CatalogRepository, useClass: process.env.DATABASE_URL ? PrismaCatalogRepository : InMemoryCatalogRepository },
  ],
  exports: [CatalogService, CatalogRepository],
})
export class CatalogModule {}
