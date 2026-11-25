import {
  Body,
  Controller,
  Delete,
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
import { BackupService } from './backup.service';

interface ExportBody {
  collections?: string[];
}

/** Backup & Maintenance: exports, stored backups with checksum
 * verified downloads, and real maintenance operations, behind
 * settings.manage as the roles matrix defines for this module. */
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
  async create(
    @Body() body: ExportBody,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.backup.createExport(user, body?.collections);
  }

  @Get('summary')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async summary() {
    return this.backup.summary();
  }

  @Get('stored')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async stored() {
    return { items: await this.backup.listBackups() };
  }

  @Post('stored')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async createStored(@CurrentUser() user: AuthPrincipal | null) {
    return this.backup.createBackup(user);
  }

  @Get('stored/:id/download')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.backup.downloadBackup(id, user);
  }

  @Delete('stored/:id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.backup.deleteBackup(id, user);
  }

  @Post('maintenance/:action')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async maintenance(
    @Param('action') action: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.backup.runMaintenance(action, user);
  }
}
