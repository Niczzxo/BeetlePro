import {
  Body,
  Controller,
  Get,
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
  storeSettingsUpdateSchema,
  type StoreSettingsUpdate,
} from './dto/website.dto';
import { WebsiteService } from './website.service';

/** Website Management: the store settings record. The module's
 * permission is settings.manage for both read and write, as in
 * the sidebar registry. */
@Controller('v1/admin/store-settings')
export class WebsiteController {
  constructor(private readonly website: WebsiteService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async get() {
    return this.website.getSettings();
  }

  @Put()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async update(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: StoreSettingsUpdate = parseBody(
      storeSettingsUpdateSchema,
      body,
    );
    return this.website.updateSettings(dto, user);
  }
}
