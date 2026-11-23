import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LeadsModule } from '../leads/leads.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { CommunicationProviderRegistry } from './providers/communication-provider.registry';
import { EmailProvider } from './providers/email.provider';
import { ManualCallProvider } from './providers/manual-call.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsappProvider } from './providers/whatsapp.provider';
import { CommunicationsRepository } from './repositories/communications.repository';
import { InMemoryCommunicationsRepository } from './repositories/in-memory-communications.repository';

/**
 * Communications module (Phase 6): the Communication Center.
 * Sends and call tasks go through the provider registry;
 * suppression comes from the leads module's repository (the
 * Phase 5 suppression records are shared across leads and
 * recovery), and consent from the visitors service.
 */
@Module({
  imports: [VisitorsModule, LeadsModule, AuditModule],
  controllers: [CommunicationsController],
  providers: [
    CommunicationsService,
    CommunicationProviderRegistry,
    WhatsappProvider,
    EmailProvider,
    SmsProvider,
    ManualCallProvider,
    {
      provide: CommunicationsRepository,
      useClass: InMemoryCommunicationsRepository,
    },
  ],
  exports: [CommunicationsService, CommunicationsRepository],
})
export class CommunicationsModule {}
