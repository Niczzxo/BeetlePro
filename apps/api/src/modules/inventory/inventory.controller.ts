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
  async listStock(@Query('productId') productId?: string) {
    return { items: await this.inventory.listStock(productId) };
  }

  /** The movement ledger. Declared before :variantId so the
   * literal segment wins over the parameter route. */
  @Get('movements')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.read')
  async listMovements(
    @Query('variantId') variantId?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    return {
      items: await this.inventory.listMovements({
        variantId: variantId || undefined,
        productId: productId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit:
          Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 2000)
            : undefined,
      }),
    };
  }

  @Get(':variantId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.read')
  async getStock(@Param('variantId') variantId: string) {
    return this.inventory.getStock(variantId);
  }

  /** Staff only: Phase 4 RBAC. Requires the inventory.adjust
   * permission (Store Manager, Product Manager, Super Admin). */
  @Post(':variantId/adjust')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('inventory.adjust')
  async adjust(
    @Param('variantId') variantId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: InventoryAdjust = parseBody(inventoryAdjustSchema, body);
    return this.inventory.adjust(variantId, dto, user);
  }
}
