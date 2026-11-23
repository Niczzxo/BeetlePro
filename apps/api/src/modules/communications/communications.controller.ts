import {
  Body,
  Controller,
  Get,
  Post,
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
  type ManualCallLog,
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
  listLog(
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
      items: this.communications.listLog({
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
  logCall(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: ManualCallLog = parseBody(manualCallLogSchema, body);
    return this.communications.logManualCall(dto, user);
  }
}
