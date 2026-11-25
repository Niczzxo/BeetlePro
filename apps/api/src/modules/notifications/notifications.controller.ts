import {
  Body,
  Controller,
  Get,
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
  notificationMarkReadSchema,
  notificationPreferencesSchema,
  type NotificationMarkRead,
  type NotificationPreferencesUpdate,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Notifications: the derived staff feed and read marking. The
 * module permission is settings.manage, as in the sidebar
 * registry; read marks are always the caller's own. */
@Controller('v1/admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async feed(@CurrentUser() user: AuthPrincipal | null) {
    return this.notifications.feed(user as AuthPrincipal);
  }

  @Post('read')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async markRead(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: NotificationMarkRead = parseBody(
      notificationMarkReadSchema,
      body,
    );
    return this.notifications.markRead(user as AuthPrincipal, dto.keys);
  }

  @Post('unread')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async markUnread(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: NotificationMarkRead = parseBody(
      notificationMarkReadSchema,
      body,
    );
    return this.notifications.markUnread(user as AuthPrincipal, dto.keys);
  }

  @Post('hide')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async hide(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: NotificationMarkRead = parseBody(
      notificationMarkReadSchema,
      body,
    );
    return this.notifications.hide(user as AuthPrincipal, dto.keys);
  }

  @Get('preferences')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async preferences(@CurrentUser() user: AuthPrincipal | null) {
    return this.notifications.getPreferences(user as AuthPrincipal);
  }

  @Put('preferences')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async savePreferences(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: NotificationPreferencesUpdate = parseBody(
      notificationPreferencesSchema,
      body,
    );
    return this.notifications.savePreferences(user as AuthPrincipal, dto);
  }
}
