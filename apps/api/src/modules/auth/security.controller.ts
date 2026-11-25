import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../common/auth/jwt';
import type { AuthPrincipal } from '../../common/auth/principal';
import { corsAllowlist } from '../../common/security';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_TTL_DAYS } from './token.service';

const familySchema = z
  .object({ familyId: z.string().trim().min(1).max(120) })
  .strict();
const keepFamilySchema = z
  .object({ keepFamilyId: z.string().trim().min(1).max(120) })
  .strict();

/**
 * Security surfaces (Security redesign): the caller's own
 * session families, and a read-only report of the server's own
 * security configuration. Nothing here returns a secret: the
 * report carries lifetimes, limits and the CORS origin list the
 * server itself enforces.
 */
@Controller()
export class SecurityController {
  constructor(private readonly auth: AuthService) {}

  @Get('v1/auth/admin/sessions')
  @UseGuards(AuthGuard)
  async ownSessions(@CurrentUser() user: AuthPrincipal | null) {
    return { items: await this.auth.listOwnSessions(user as AuthPrincipal) };
  }

  @Post('v1/auth/admin/sessions/revoke')
  @UseGuards(AuthGuard)
  async revokeFamily(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto = parseBody(familySchema, body);
    return this.auth.revokeOwnFamily(user as AuthPrincipal, dto.familyId);
  }

  @Post('v1/auth/admin/sessions/revoke-others')
  @UseGuards(AuthGuard)
  async revokeOthers(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto = parseBody(keepFamilySchema, body);
    return this.auth.revokeOtherFamilies(
      user as AuthPrincipal,
      dto.keepFamilyId,
    );
  }

  @Get('v1/admin/security/settings')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async settings() {
    return {
      corsAllowlist: corsAllowlist(),
      corsCredentials: true,
      securityHeaders: [
        'Content-Security-Policy (admin and storefront HTML)',
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options',
        'Referrer-Policy',
        'Strict-Transport-Security (production only)',
      ],
      bodyLimit: '100kb',
      loginRateLimitPerMinute: 10,
      accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
      passwordMinLength: 8,
      mfaChallengeTtlMinutes: 5,
      requireMfaForAdmins: false,
      accountLockout: false,
      loginNotifications: 'not-configured',
    };
  }
}
