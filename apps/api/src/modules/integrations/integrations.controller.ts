import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
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
}
