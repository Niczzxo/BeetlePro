import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PublicStaffController } from './public-staff.controller';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { InMemoryStaffInvitationsRepository } from './repositories/in-memory-staff-invitations.repository';
import { PrismaStaffInvitationsRepository } from './repositories/prisma-staff-invitations.repository';
import { StaffInvitationsRepository } from './repositories/staff-invitations.repository';

/**
 * Staff module: account management over the auth module's
 * admins and sessions repository seams (exported by AuthModule).
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [StaffController, PublicStaffController],
  providers: [
    StaffService,
    {
      provide: StaffInvitationsRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaStaffInvitationsRepository
        : InMemoryStaffInvitationsRepository,
    },
  ],
  exports: [StaffService],
})
export class StaffModule {}
