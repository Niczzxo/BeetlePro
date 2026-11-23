import {
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { BackupService } from './backup.service';

/** Backup & Maintenance: staff-triggered JSON exports and the
 * record of past exports, behind settings.manage. */
@Controller('v1/admin/backups')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: await this.backup.listExports() };
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async create(@CurrentUser() user: AuthPrincipal | null) {
    return this.backup.createExport(user);
  }
}
