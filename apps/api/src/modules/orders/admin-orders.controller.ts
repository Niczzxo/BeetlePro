import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ORDER_STATUSES, type OrderStatus } from '@dostelo/types';
import { RequirePermission } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { OrdersService } from './orders.service';

/**
 * Staff order reads for the admin portal (Phase 4, chunk 2). The
 * customer-shaped routes stay in OrdersController; everything here
 * requires a staff token holding orders.read. The list accepts an
 * optional exact `status` filter; the detail carries the status
 * event history and the legal next states from the flow policy.
 */
@Controller('v1/admin/orders')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission('orders.read')
  async list(@Query('status') status?: string) {
    return {
      items: await this.orders.listAll(
        ORDER_STATUSES.includes(status as OrderStatus)
          ? (status as OrderStatus)
          : undefined,
      ),
    };
  }

  @Get(':orderNumber')
  @RequirePermission('orders.read')
  async detail(@Param('orderNumber') orderNumber: string) {
    return this.orders.getDetail(orderNumber);
  }
}
