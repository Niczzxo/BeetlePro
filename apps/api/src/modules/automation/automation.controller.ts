import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { AutomationService } from './automation.service';

/** Automation: the read-only inventory of the automations that
 * actually run, behind settings.manage as in the registry. */
@Controller('v1/admin/automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: await this.automation.list() };
  }
}
