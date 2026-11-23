import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LEAD_STATUSES, type LeadStatus } from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  contactAttemptSchema,
  followUpTaskCreateSchema,
  leadAssignSchema,
  leadCreateSchema,
  leadStatusChangeSchema,
  type ContactAttemptCreate,
  type FollowUpTaskCreate,
  type LeadAssign,
  type LeadCreate,
  type LeadStatusChange,
} from './dto/lead.dto';
import { LeadsService } from './leads.service';

/**
 * Staff Lead Management endpoints (Phase 5), section 04 of the
 * admin master structure. Guards: leads.read for reads,
 * leads.create for manual creation, leads.edit for status moves,
 * tasks and opt-out recording, leads.assign for assignment, and
 * leads.contact for contact attempts. The contact rules
 * themselves (details, basis, consent, opt-out) are enforced in
 * the service, behind these guards.
 */
@Controller('v1/leads')
@UseGuards(AuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @RequirePermission('leads.create')
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: LeadCreate = parseBody(leadCreateSchema, body);
    return this.leads.createManual(dto, user);
  }

  @Get()
  @RequirePermission('leads.read')
  list(
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    const parsedStatus = LEAD_STATUSES.includes(status as LeadStatus)
      ? (status as LeadStatus)
      : undefined;
    return {
      items: this.leads.list({
        status: parsedStatus,
        assigneeId: assigneeId || undefined,
      }),
    };
  }

  @Get(':id')
  @RequirePermission('leads.read')
  detail(@Param('id') id: string) {
    return this.leads.getDetail(id);
  }

  @Post(':id/assign')
  @RequirePermission('leads.assign')
  assign(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: LeadAssign = parseBody(leadAssignSchema, body);
    return this.leads.assign(id, dto.assigneeId, user);
  }

  @Post(':id/status')
  @RequirePermission('leads.edit')
  changeStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: LeadStatusChange = parseBody(leadStatusChangeSchema, body);
    return this.leads.transitionStatus(id, dto.status, user);
  }

  @Post(':id/follow-ups')
  @RequirePermission('leads.edit')
  createTask(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: FollowUpTaskCreate = parseBody(
      followUpTaskCreateSchema,
      body,
    );
    return this.leads.createTask(id, dto, user);
  }

  @Get(':id/follow-ups')
  @RequirePermission('leads.read')
  listTasks(@Param('id') id: string) {
    return { items: this.leads.listTasks(id) };
  }

  @Post(':id/follow-ups/:taskId/complete')
  @RequirePermission('leads.edit')
  completeTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.leads.completeTask(id, taskId, user);
  }

  @Post(':id/contact-attempts')
  @RequirePermission('leads.contact')
  recordAttempt(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: ContactAttemptCreate = parseBody(contactAttemptSchema, body);
    return this.leads.recordContactAttempt(id, dto, user);
  }

  @Get(':id/contact-attempts')
  @RequirePermission('leads.read')
  listAttempts(@Param('id') id: string) {
    return { items: this.leads.listAttempts(id) };
  }

  @Post(':id/opt-out')
  @RequirePermission('leads.edit')
  optOut(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.leads.optOut(id, user);
  }
}
