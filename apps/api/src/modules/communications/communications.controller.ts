import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_LOG_STATUSES,
  type CommunicationChannel,
  type CommunicationLogStatus,
} from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  manualCallLogSchema,
  messageTemplateUpsertSchema,
  staffSendSchema,
  type ManualCallLog,
  type MessageTemplateUpsert,
  type StaffSend,
} from './dto/communication.dto';
import { CommunicationsService } from './communications.service';

/**
 * Staff Communication Center endpoints (Phase 6). The log read
 * sits behind communications.read. Logging a call is a recovery
 * and CRM action, so it rides on recovery.edit (see the roles
 * matrix note in @dostelo/types): the roles that work recoveries
 * are the roles that place the calls. Automated sends are not
 * exposed as a staff endpoint in this chunk; recovery steps send
 * through the service internally.
 */
@Controller('v1/communications')
@UseGuards(AuthGuard, PermissionsGuard)
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('log')
  @RequirePermission('communications.read')
  async listLog(
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
    @Query('abandonedCartId') abandonedCartId?: string,
  ) {
    const parsedChannel = COMMUNICATION_CHANNELS.includes(
      channel as CommunicationChannel,
    )
      ? (channel as CommunicationChannel)
      : undefined;
    const parsedStatus = COMMUNICATION_LOG_STATUSES.includes(
      status as CommunicationLogStatus,
    )
      ? (status as CommunicationLogStatus)
      : undefined;
    return {
      items: await this.communications.listLog({
        channel: parsedChannel,
        status: parsedStatus,
        customerId: customerId || undefined,
        leadId: leadId || undefined,
        abandonedCartId: abandonedCartId || undefined,
      }),
    };
  }

  @Post('calls')
  @RequirePermission('recovery.edit')
  async logCall(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: ManualCallLog = parseBody(manualCallLogSchema, body);
    return this.communications.logManualCall(dto, user);
  }

  /**
   * A staff-initiated message from the Communication Center. It
   * goes through the same send path as the automated flows:
   * suppression and consent are checked first, and an
   * unconfigured provider records not-configured. The recorded
   * log entry is returned so the portal shows the honest
   * outcome, never an assumed success. Write access rides on
   * recovery.edit, the same pattern as call logging.
   */
  @Post('send')
  @RequirePermission('recovery.edit')
  async sendMessage(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: StaffSend = parseBody(staffSendSchema, body);
    return this.communications.send({
      channel: dto.channel,
      to: dto.to,
      customerId: dto.customerId ?? null,
      leadId: dto.leadId ?? null,
      abandonedCartId: dto.abandonedCartId ?? null,
      templateKey: dto.templateKey,
      subject: dto.subject,
      body: dto.body,
      purpose: dto.purpose,
      staffId: user.id,
    });
  }

  @Get('templates')
  @RequirePermission('communications.read')
  async listTemplates() {
    return { items: await this.communications.listTemplates() };
  }

  @Put('templates/:key')
  @RequirePermission('recovery.edit')
  async upsertTemplate(
    @Param('key') key: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: MessageTemplateUpsert = parseBody(
      messageTemplateUpsertSchema,
      body,
    );
    return this.communications.upsertTemplate(key, dto, user);
  }

  @Delete('templates/:key')
  @RequirePermission('recovery.edit')
  async deleteTemplate(
    @Param('key') key: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.communications.deleteTemplate(key, user);
  }
}
