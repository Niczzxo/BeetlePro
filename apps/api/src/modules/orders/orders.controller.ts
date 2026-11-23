import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import {
  principalHasPermission,
  type AuthPrincipal,
} from '../../common/auth/principal';
import {
  orderStatusTransitionSchema,
  type OrderStatusTransition,
} from './dto/transition-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * A customer's own order list. Requires a token: the customer
   * themselves (subject must match customerId) or a staff token
   * holding orders.read.
   */
  @Get()
  @UseGuards(AuthGuard)
  list(
    @Query('customerId') customerId: string | undefined,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    if (!customerId) {
      throw new BadRequestException('customerId query parameter is required');
    }
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.type === 'customer') {
      if (user.id !== customerId) {
        throw new ForbiddenException(
          'Customers can only list their own orders',
        );
      }
    } else if (!principalHasPermission(user, 'orders.read')) {
      throw new ForbiddenException(
        'Missing required permission: orders.read',
      );
    }
    return { items: this.orders.listForCustomer(customerId) };
  }

  @Get(':orderNumber')
  getByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orders.getByNumber(orderNumber);
  }

  /** Staff only: Phase 4 RBAC. Requires orders.edit (Store
   * Manager, Delivery Manager, Super Admin). */
  @Post(':orderNumber/status')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.edit')
  transition(
    @Param('orderNumber') orderNumber: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: OrderStatusTransition = parseBody(
      orderStatusTransitionSchema,
      body,
    );
    return this.orders.transition(orderNumber, dto, user);
  }
}
