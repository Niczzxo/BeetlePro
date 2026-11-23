import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

/**
 * Integrations module: a read-only status board computed from
 * the provider config checks. It owns no data and changes no
 * configuration (credentials live in the environment by design).
 */
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
