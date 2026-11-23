import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  createStaffSchema,
  staffRolesSchema,
  type CreateStaff,
  type StaffRolesUpdate,
} from './dto/staff.dto';
import { StaffService } from './staff.service';

/** Staff Management: every route behind staff.manage. The
 * responses are StaffMemberView only; hashes and MFA secrets
 * never leave the API. */
@Controller('v1/admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async list() {
    return { items: await this.staff.list() };
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: CreateStaff = parseBody(createStaffSchema, body);
    return this.staff.create(dto, user);
  }

  @Post(':id/roles')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async setRoles(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: StaffRolesUpdate = parseBody(staffRolesSchema, body);
    return this.staff.setRoles(id, dto, user);
  }

  @Post(':id/deactivate')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.staff.setActive(id, false, user);
  }

  @Post(':id/activate')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.staff.setActive(id, true, user);
  }

  @Post(':id/revoke-sessions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('staff.manage')
  async revokeSessions(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.staff.revokeSessionsFor(id, user);
  }
}
