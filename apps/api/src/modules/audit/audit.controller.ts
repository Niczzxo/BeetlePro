import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditActorType } from '@dostelo/types';
import { RequirePermission } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { AuditService } from './audit.service';

const ACTOR_TYPES: AuditActorType[] = ['admin', 'customer', 'system'];

/**
 * Staff read of the audit trail. Guarded by audit.read (Super
 * Admin and Store Manager per the roles matrix). Filters: actor
 * (actorId), actorType, action, and a createdAt range via from
 * and to (ISO dates).
 */
@Controller('v1/admin/audit-log')
@UseGuards(AuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  list(
    @Query('actorId') actorId?: string,
    @Query('actorType') actorType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return {
      items: this.audit.list({
        actorId: actorId || undefined,
        actorType: ACTOR_TYPES.includes(actorType as AuditActorType)
          ? (actorType as AuditActorType)
          : undefined,
        action: action || undefined,
        from: from || undefined,
        to: to || undefined,
        limit:
          parsedLimit && parsedLimit > 0
            ? Math.min(parsedLimit, 500)
            : undefined,
      }),
    };
  }
}
