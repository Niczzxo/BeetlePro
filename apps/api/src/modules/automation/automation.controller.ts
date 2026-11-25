import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AutomationService } from './automation.service';

/** Automation: the inventory of the automations that actually
 * run, behind settings.manage as in the registry. Pause and
 * activate write the persisted flags the flows check. */
@Controller('v1/admin/automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: await this.automation.list() };
  }

  @Get('executions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async executions(
    @Query('workflowKey') workflowKey?: string,
    @Query('status') status?: 'success' | 'failed',
    @Query('search') search?: string,
  ) {
    return {
      items: await this.automation.listExecutions({
        workflowKey,
        status,
        search,
      }),
    };
  }

  @Post(':key/pause')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async pause(
    @Param('key') key: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.automation.setFlowEnabled(key, false, user);
  }

  @Post(':key/activate')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async activate(
    @Param('key') key: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.automation.setFlowEnabled(key, true, user);
  }
}
