import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit';
import { CartRecoveryService } from './cart-recovery.service';

/**
 * The public recovery link target (Phase 6): GET
 * /v1/recovery/:token. Unguarded by design, because the token is
 * the credential (24 random bytes, never a cart or customer id).
 * The view carries the cart contents at current catalog prices
 * and never any contact details; recovered, closed, cancelled
 * and expired tokens answer honestly with no items.
 *
 * Rate limited per IP plus token (Phase 7): a real recovery link
 * is opened a handful of times, so the limit only bites token
 * guessing and scraping.
 */
const RECOVERY_TOKEN_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

@Controller('v1/recovery')
export class RecoveryController {
  constructor(private readonly recovery: CartRecoveryService) {}

  @Get(':token')
  @UseGuards(RateLimitGuard)
  @RateLimit(RECOVERY_TOKEN_RATE_LIMIT)
  getByToken(@Param('token') token: string) {
    return this.recovery.getByToken(token);
  }
}
