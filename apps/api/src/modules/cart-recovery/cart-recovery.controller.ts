import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ABANDONED_CART_STATUSES,
  type AbandonedCartStatus,
} from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  recoverySettingsUpdateSchema,
  type RecoverySettingsUpdate,
} from './dto/recovery.dto';
import { CartRecoveryService } from './cart-recovery.service';

/**
 * Staff Abandoned Cart Recovery endpoints (Phase 6). Reads sit
 * behind recovery.read; every action (scan, settings, cancel,
 * run-step) sits behind recovery.edit and is audited in the
 * service. The public token read lives in RecoveryController
 * without guards, by design: the unguessable token is the
 * credential, and its view carries no personal data.
 */
@Controller('v1/cart-recovery')
@UseGuards(AuthGuard, PermissionsGuard)
export class CartRecoveryController {
  constructor(private readonly recovery: CartRecoveryService) {}

  @Get()
  @RequirePermission('recovery.read')
  async list(@Query('status') status?: string) {
    const parsed = ABANDONED_CART_STATUSES.includes(
      status as AbandonedCartStatus,
    )
      ? (status as AbandonedCartStatus)
      : undefined;
    return { items: await this.recovery.list({ status: parsed }) };
  }

  @Get('settings')
  @RequirePermission('recovery.read')
  async getSettings() {
    return this.recovery.getSettings();
  }

  @Put('settings')
  @RequirePermission('recovery.edit')
  async updateSettings(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: RecoverySettingsUpdate = parseBody(
      recoverySettingsUpdateSchema,
      body,
    );
    return this.recovery.updateSettings(dto, user);
  }

  @Post('scan')
  @RequirePermission('recovery.edit')
  async scan(@CurrentUser() user: AuthPrincipal) {
    const result = await this.recovery.scan();
    return { ...result, requestedBy: user.id };
  }

  @Get(':id')
  @RequirePermission('recovery.read')
  async detail(@Param('id') id: string) {
    return this.recovery.getDetail(id);
  }

  @Post(':id/cancel')
  @RequirePermission('recovery.edit')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.recovery.cancelRecovery(id, user);
  }

  @Post(':id/run-step')
  @RequirePermission('recovery.edit')
  async runStep(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.recovery.runNextStep(id, user);
  }
}
