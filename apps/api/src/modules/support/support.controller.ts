import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SupportTicketStatus } from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createSupportTicketSchema,
  supportTicketAssignSchema,
  supportTicketReplySchema,
  supportTicketStatusSchema,
  type CreateSupportTicket,
  type SupportTicketAssign,
  type SupportTicketReply,
  type SupportTicketStatusUpdate,
} from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * Customer Support endpoints. The module's view permission is
 * customers.read (the same key the sidebar uses); ticket work
 * rides on customers.edit.
 */
@Controller('v1/admin/support-tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.read')
  async list(
    @Query('status') status?: SupportTicketStatus,
    @Query('customerId') customerId?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return {
      items: await this.support.list({ status, customerId, assignedToId }),
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.read')
  async get(@Param('id') id: string) {
    return this.support.getDetail(id);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.edit')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: CreateSupportTicket = parseBody(
      createSupportTicketSchema,
      body,
    );
    return this.support.create(dto, user);
  }

  @Post(':id/reply')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.edit')
  async reply(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: SupportTicketReply = parseBody(
      supportTicketReplySchema,
      body,
    );
    return this.support.reply(id, dto, user);
  }

  @Post(':id/status')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.edit')
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: SupportTicketStatusUpdate = parseBody(
      supportTicketStatusSchema,
      body,
    );
    return this.support.setStatus(id, dto, user);
  }

  @Post(':id/assign')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.edit')
  async assign(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: SupportTicketAssign = parseBody(
      supportTicketAssignSchema,
      body,
    );
    return this.support.assign(id, dto.assignedToId, user);
  }
}
