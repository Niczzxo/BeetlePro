import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { IntegrationsService } from './integrations.service';

/** System Integrations: the read-only provider status board
 * behind settings.manage. */
@Controller('v1/admin/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: this.integrations.status() };
  }

  @Post(':key/test')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async test(
    @Param('key') key: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.integrations.test(key, user);
  }
}
