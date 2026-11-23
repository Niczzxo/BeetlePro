import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { ClientIp, CurrentUser } from '../../common/auth/decorators';
import { AuthGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  RateLimit,
  RateLimitGuard,
} from '../../common/rate-limit';
import { AuthService } from './auth.service';
import {
  adminLoginSchema,
  customerLoginSchema,
  customerRegistrationSchema,
  logoutSchema,
  mfaExchangeSchema,
  refreshTokenSchema,
  totpCodeSchema,
  type AdminLogin,
  type CustomerLogin,
  type CustomerRegistration,
  type LogoutRequest,
  type MfaExchange,
  type RefreshTokenRequest,
  type TotpCode,
} from './dto/auth.dto';

const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * Authentication API (Phase 4). Password logins and the MFA code
 * exchange are rate limited per IP plus identifier (10 attempts
 * per minute, see common/rate-limit). Bearer routes here are the
 * MFA management endpoints, which need an admin token.
 */
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Registration lives in the customers module; this is the same
   * flow plus an immediate token pair, so a new customer is
   * signed in at once. */
  @Post('register')
  async register(@Body() body: unknown) {
    const dto: CustomerRegistration = parseBody(
      customerRegistrationSchema,
      body,
    );
    return this.auth.registerCustomer(dto);
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit(LOGIN_RATE_LIMIT)
  async login(@Body() body: unknown, @ClientIp() ip: string | null) {
    const dto: CustomerLogin = parseBody(customerLoginSchema, body);
    return this.auth.loginCustomer(dto, ip);
  }

  @Post('refresh')
  async refresh(@Body() body: unknown) {
    const dto: RefreshTokenRequest = parseBody(refreshTokenSchema, body);
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: unknown) {
    const dto: LogoutRequest = parseBody(logoutSchema, body);
    return this.auth.logout(dto.refreshToken);
  }

  @Post('admin/login')
  @UseGuards(RateLimitGuard)
  @RateLimit(LOGIN_RATE_LIMIT)
  async adminLogin(@Body() body: unknown, @ClientIp() ip: string | null) {
    const dto: AdminLogin = parseBody(adminLoginSchema, body);
    return this.auth.loginAdmin(dto, ip);
  }

  @Post('admin/mfa/exchange')
  @UseGuards(RateLimitGuard)
  @RateLimit(LOGIN_RATE_LIMIT)
  async mfaExchange(@Body() body: unknown, @ClientIp() ip: string | null) {
    const dto: MfaExchange = parseBody(mfaExchangeSchema, body);
    return this.auth.exchangeMfaChallenge(dto.challengeId, dto.code, ip);
  }

  @Post('admin/mfa/enroll')
  @UseGuards(AuthGuard)
  async enrollMfa(
    @CurrentUser() user: AuthPrincipal | null,
    @ClientIp() ip: string | null,
  ) {
    return this.auth.enrollMfa(user as AuthPrincipal, ip);
  }

  @Post('admin/mfa/enable')
  @UseGuards(AuthGuard)
  async enableMfa(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
    @ClientIp() ip: string | null,
  ) {
    const dto: TotpCode = parseBody(totpCodeSchema, body);
    return this.auth.enableMfa(user as AuthPrincipal, dto.code, ip);
  }

  @Post('admin/mfa/disable')
  @UseGuards(AuthGuard)
  async disableMfa(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
    @ClientIp() ip: string | null,
  ) {
    const dto: TotpCode = parseBody(totpCodeSchema, body);
    return this.auth.disableMfa(user as AuthPrincipal, dto.code, ip);
  }
}
