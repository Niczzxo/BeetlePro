import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { CheckoutService } from './checkout.service';
import {
  checkoutRequestSchema,
  type CheckoutRequest,
} from './dto/checkout.dto';

/**
 * Staff order creation for the admin portal (Orders redesign).
 * A staff member builds an order for an existing customer or a
 * guest; pricing, zone detection, stock reservation and totals
 * all run through the same CheckoutService.placeOrder the public
 * checkout uses, so a staff order can never carry client-computed
 * totals. The order starts unpaid like any other order: a paid
 * state still requires a verified payment record. Lives in the
 * checkout module because CheckoutModule already depends on
 * OrdersModule, not the other way around.
 */
@Controller('v1/admin/orders')
@UseGuards(AuthGuard, PermissionsGuard)
export class StaffOrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @RequirePermission('orders.create')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: CheckoutRequest = parseBody(checkoutRequestSchema, body);
    const order = await this.checkout.placeOrder(dto);
    await this.audit.recordForPrincipal(user, {
      action: 'orders.staff-created',
      entityType: 'order',
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });
    return order;
  }
}
