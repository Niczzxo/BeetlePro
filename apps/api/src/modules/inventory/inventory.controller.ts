import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  inventoryAdjustSchema,
  type InventoryAdjust,
} from './dto/adjust-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('v1/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Stock reads are staff-shaped (the storefront reads stock
   * through the catalog overlay), so since Phase 4 chunk 2 they
   * sit behind the inventory.read permission. */
  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.read')
  listStock(@Query('productId') productId?: string) {
    return { items: this.inventory.listStock(productId) };
  }

  @Get(':variantId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.read')
  getStock(@Param('variantId') variantId: string) {
    return this.inventory.getStock(variantId);
  }

  /** Staff only: Phase 4 RBAC. Requires the inventory.adjust
   * permission (Store Manager, Product Manager, Super Admin). */
  @Post(':variantId/adjust')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.adjust')
  adjust(
    @Param('variantId') variantId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: InventoryAdjust = parseBody(inventoryAdjustSchema, body);
    return this.inventory.adjust(variantId, dto, user);
  }
}
