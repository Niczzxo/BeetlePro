import { Module } from '@nestjs/common';
import { RateLimitGuard, RateLimiter } from '../../common/rate-limit';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthController } from './auth.controller';
import { SecurityController } from './security.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AdminsRepository } from './repositories/admins.repository';
import { InMemoryAdminsRepository } from './repositories/in-memory-admins.repository';
import { PrismaAdminsRepository } from './repositories/prisma-admins.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { InMemorySessionsRepository } from './repositories/in-memory-sessions.repository';
import { PrismaSessionsRepository } from './repositories/prisma-sessions.repository';

/**
 * Auth module (Phase 4, chunk 1): customer and admin login with
 * JWT access tokens and rotating refresh-token sessions, admin
 * seeding from the environment, TOTP MFA for staff, and the auth
 * rate limiter. Guards live in common/auth and are used directly
 * by the modules they protect.
 */
@Module({
  imports: [CustomersModule, AuditModule],
  controllers: [AuthController, SecurityController],
  providers: [
    AuthService,
    TokenService,
    RateLimiter,
    RateLimitGuard,
    { provide: AdminsRepository, useClass: process.env.DATABASE_URL ? PrismaAdminsRepository : InMemoryAdminsRepository },
    { provide: SessionsRepository, useClass: process.env.DATABASE_URL ? PrismaSessionsRepository : InMemorySessionsRepository },
  ],
  exports: [AuthService, TokenService, AdminsRepository, SessionsRepository],
})
export class AuthModule {}
