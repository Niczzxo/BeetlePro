import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

/** Public catalog endpoints. HTTP only; all rules live in the service. */
@Controller('v1/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  async listProducts(@Query('category') category?: string) {
    return this.catalog.listProducts(category);
  }

  @Get('products/:key')
  async getProduct(@Param('key') key: string) {
    return this.catalog.getProduct(key);
  }

  @Get('categories')
  async listCategories() {
    return { items: await this.catalog.listCategories() };
  }
}
