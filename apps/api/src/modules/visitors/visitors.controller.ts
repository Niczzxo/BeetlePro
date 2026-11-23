import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CurrentUser } from '../../common/auth/decorators';
import { AuthGuard } from '../../common/auth/guards';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  consentRecordSchema,
  visitorEventSchema,
  visitorLinkSchema,
  type ConsentRecordInput,
  type VisitorEventIngest,
  type VisitorLinkInput,
} from './dto/visitor.dto';
import { VisitorsService } from './visitors.service';

/**
 * Public visitor tracking endpoints (Phase 5). Event ingestion
 * and consent are unauthenticated by design: the payload carries
 * only random first-party ids and the closed, personal-data-free
 * event fields from the validation schema. Linking is the one
 * authenticated route, and the customer id comes from the token,
 * never from the body.
 *
 * Ingestion and consent are rate limited per IP plus visitor id
 * (Phase 7): a storefront tab sends a handful of events per
 * minute, so these limits only bite scripted abuse.
 */
const EVENT_RATE_LIMIT = { limit: 300, windowMs: 60_000 };
const CONSENT_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

@Controller('v1')
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Post('visitor-events')
  @UseGuards(RateLimitGuard)
  @RateLimit(EVENT_RATE_LIMIT)
  ingest(@Body() body: unknown) {
    const dto: VisitorEventIngest = parseBody(visitorEventSchema, body);
    const event = this.visitors.ingestEvent(dto);
    return {
      id: event.id,
      sessionId: event.sessionId,
      marketingUsable: event.marketingUsable,
    };
  }

  @Post('visitors/consent')
  @UseGuards(RateLimitGuard)
  @RateLimit(CONSENT_RATE_LIMIT)
  consent(@Body() body: unknown) {
    const dto: ConsentRecordInput = parseBody(consentRecordSchema, body);
    return this.visitors.recordConsent(dto);
  }

  @Post('visitors/link')
  @UseGuards(AuthGuard)
  link(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    if (!user || user.type !== 'customer') {
      throw new ForbiddenException(
        'Only a signed-in customer can link a visitor id to their account',
      );
    }
    const dto: VisitorLinkInput = parseBody(visitorLinkSchema, body);
    const link = this.visitors.linkAuthenticated(user.id, dto.visitorId);
    return {
      visitorId: link.visitorId,
      customerId: link.customerId,
      basis: link.basis,
    };
  }
}
