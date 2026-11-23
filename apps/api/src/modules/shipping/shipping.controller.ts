import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  COURIERS,
  SHIPMENT_STATUSES,
  type Courier,
  type ShipmentStatus,
} from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createShipmentSchema,
  type CreateShipment,
} from './dto/shipping.dto';
import { ShippingService } from './shipping.service';

/**
 * Staff Shipping and Courier endpoints (Phase 6, chunk 2).
 * Reads sit behind shipping.read; booking and status refresh
 * sit behind shipping.edit, the keys the Delivery Manager and
 * Store Manager hold in the roles matrix. Booking is honest: an
 * unconfigured courier records a not-configured shipment, never
 * a fake booking.
 */
@Controller('v1/shipping')
@UseGuards(AuthGuard, PermissionsGuard)
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post()
  @RequirePermission('shipping.edit')
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: CreateShipment = parseBody(createShipmentSchema, body);
    return this.shipping.createShipment(dto, user);
  }

  @Get()
  @RequirePermission('shipping.read')
  list(
    @Query('courier') courier?: string,
    @Query('status') status?: string,
    @Query('orderNumber') orderNumber?: string,
  ) {
    return {
      items: this.shipping.listShipments({
        courier: COURIERS.includes(courier as Courier)
          ? (courier as Courier)
          : undefined,
        status: SHIPMENT_STATUSES.includes(status as ShipmentStatus)
          ? (status as ShipmentStatus)
          : undefined,
        orderNumber: orderNumber || undefined,
      }),
    };
  }

  @Get(':id')
  @RequirePermission('shipping.read')
  detail(@Param('id') id: string) {
    return this.shipping.getDetail(id);
  }

  @Post(':id/refresh')
  @RequirePermission('shipping.edit')
  refresh(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.shipping.refreshStatus(id, user);
  }
}
