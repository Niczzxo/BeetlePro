import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';
import { CartsRepository } from './repositories/carts.repository';
import { InMemoryCartsRepository } from './repositories/in-memory-carts.repository';

@Module({
  imports: [CatalogModule, InventoryModule],
  controllers: [CartsController],
  providers: [
    CartsService,
    { provide: CartsRepository, useClass: InMemoryCartsRepository },
  ],
  exports: [CartsService, CartsRepository],
})
export class CartsModule {}
