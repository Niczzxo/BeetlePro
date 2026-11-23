import { Injectable } from '@nestjs/common';
import type { CommunicationChannel } from '@dostelo/types';
import type { CommunicationProvider } from './communication-provider';
import { EmailProvider } from './email.provider';
import { ManualCallProvider } from './manual-call.provider';
import { SmsProvider } from './sms.provider';
import { WhatsappProvider } from './whatsapp.provider';

/** Routes a channel to its adapter, as the payment provider
 * registry does for gateways. */
@Injectable()
export class CommunicationProviderRegistry {
  constructor(
    private readonly whatsapp: WhatsappProvider,
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
    private readonly manualCall: ManualCallProvider,
  ) {}

  forChannel(channel: CommunicationChannel): CommunicationProvider {
    switch (channel) {
      case 'whatsapp':
        return this.whatsapp;
      case 'email':
        return this.email;
      case 'sms':
        return this.sms;
      case 'call':
        return this.manualCall;
    }
  }
}
