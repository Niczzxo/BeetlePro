import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

/**
 * Website module: the store settings editor over the global
 * SettingsRepository seam (provided by StoreModule or
 * PrismaModule, as with the other settings consumers).
 */
@Module({
  imports: [AuditModule],
  controllers: [WebsiteController],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
