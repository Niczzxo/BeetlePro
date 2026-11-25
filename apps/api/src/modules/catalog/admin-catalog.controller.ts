import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { CatalogService } from './catalog.service';
import {
  productCreateSchema,
  productUpdateSchema,
  type ProductCreate,
  type ProductUpdate,
} from './dto/catalog.dto';

/**
 * Staff catalogue administration (Products redesign). Unlike the
 * public catalogue, which serves active products only, these
 * endpoints work with every status: publication status governs
 * the public responses, so drafts and archived products never
 * reach the storefront. Writes are permission-gated per action
 * and audited in the service.
 */
@Controller('v1/admin/products')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission('products.read')
  async list() {
    return this.catalog.listAllProducts();
  }

  @Get(':id')
  @RequirePermission('products.read')
  async detail(@Param('id') id: string) {
    return this.catalog.getProductForAdmin(id);
  }

  @Post()
  @RequirePermission('products.create')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: ProductCreate = parseBody(productCreateSchema, body);
    return this.catalog.createProduct(dto, user);
  }

  @Put(':id')
  @RequirePermission('products.edit')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: ProductUpdate = parseBody(productUpdateSchema, body);
    return this.catalog.updateProduct(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('products.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.catalog.deleteProduct(id, user);
  }
}
