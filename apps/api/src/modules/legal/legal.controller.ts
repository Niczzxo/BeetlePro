import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  legalDocumentCreateSchema,
  legalDocumentUpdateSchema,
  type LegalDocumentCreate,
  type LegalDocumentUpdate,
} from './dto/legal.dto';
import { LegalService } from './legal.service';

/** Legal & Compliance: documents with draft and published
 * copies, version history and custom documents, behind
 * settings.manage as the roles matrix defines for this module. */
@Controller('v1/admin/legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: await this.legal.list() };
  }

  @Get('sync-status')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async syncStatus() {
    return this.legal.syncStatus();
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: LegalDocumentCreate = parseBody(
      legalDocumentCreateSchema,
      body,
    );
    return this.legal.create(dto, user);
  }

  @Get(':slug')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async get(@Param('slug') slug: string) {
    return this.legal.get(slug);
  }

  @Put(':slug')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async update(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: LegalDocumentUpdate = parseBody(
      legalDocumentUpdateSchema,
      body,
    );
    return this.legal.update(slug, dto, user);
  }

  @Post(':slug/publish')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async publish(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.legal.publish(slug, user);
  }

  @Post(':slug/unpublish')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async unpublish(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.legal.unpublish(slug, user);
  }

  @Get(':slug/versions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async versions(@Param('slug') slug: string) {
    return { items: await this.legal.listVersions(slug) };
  }

  @Post(':slug/versions/:versionId/restore')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async restore(
    @Param('slug') slug: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.legal.restoreVersion(slug, versionId, user);
  }
}
