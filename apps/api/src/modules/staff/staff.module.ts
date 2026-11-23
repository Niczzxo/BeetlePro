import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/**
 * Staff module: account management over the auth module's
 * admins and sessions repository seams (exported by AuthModule).
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
