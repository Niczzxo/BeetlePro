import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ReturnStatus } from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createReturnSchema,
  type CreateReturn,
} from './dto/create-return.dto';
import { ReturnsService } from './returns.service';

/**
 * Returns and refunds hand-off (admin master structure module
 * 12). Reads and decisions ride on the orders permissions, since
 * a return is an order outcome; the refund hand-off itself needs
 * payments.refund because it creates a refund in Payments.
 */
@Controller('v1/admin/returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.read')
  async list(
    @Query('status') status?: ReturnStatus,
    @Query('orderNumber') orderNumber?: string,
  ) {
    return { items: await this.returns.list({ status, orderNumber }) };
  }

  @Get(':id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.read')
  async get(@Param('id') id: string) {
    return this.returns.getById(id);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.edit')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: CreateReturn = parseBody(createReturnSchema, body);
    return this.returns.create(dto, user);
  }

  @Post(':id/approve')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.edit')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.returns.approve(id, user);
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.edit')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.returns.reject(id, user);
  }

  @Post(':id/refund')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.refund')
  async handOffRefund(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.returns.handOffRefund(id, user);
  }

  @Post(':id/complete')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('orders.edit')
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.returns.complete(id, user);
  }
}
