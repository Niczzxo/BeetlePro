import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IDENTITY_STATUSES, type IdentityStatus } from '@dostelo/types';
import { RequirePermission } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { BuyerIntelligenceService } from './buyer-intelligence.service';

/**
 * Staff Buyer Intelligence reads (Phase 5). Guard: buyers.read.
 * Identity status is reported exactly as recorded by the linking
 * flows; these reads never upgrade an anonymous session, whatever
 * its score. Optional filters: `status` (an identity status) and
 * `minScore` (a lead score floor).
 */
@Controller('v1/admin/buyer-intelligence')
@UseGuards(AuthGuard, PermissionsGuard)
export class BuyerIntelligenceController {
  constructor(private readonly intelligence: BuyerIntelligenceService) {}

  @Get('sessions')
  @RequirePermission('buyers.read')
  listSessions(
    @Query('status') status?: string,
    @Query('minScore') minScore?: string,
  ) {
    const parsedStatus = IDENTITY_STATUSES.includes(
      status as IdentityStatus,
    )
      ? (status as IdentityStatus)
      : undefined;
    const parsedMin = minScore ? Number(minScore) : undefined;
    return {
      items: this.intelligence.listSessions({
        status: parsedStatus,
        minScore:
          parsedMin !== undefined && Number.isFinite(parsedMin)
            ? parsedMin
            : undefined,
      }),
    };
  }

  @Get('sessions/:sessionId')
  @RequirePermission('buyers.read')
  getSession(@Param('sessionId') sessionId: string) {
    return this.intelligence.getSession(sessionId);
  }
}
