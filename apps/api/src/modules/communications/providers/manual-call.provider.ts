import { Injectable } from '@nestjs/common';
import {
  CommunicationProvider,
  type ProviderSendInput,
  type ProviderSendResult,
} from './communication-provider';

/**
 * The manual call channel. There is no telephony provider: staff
 * place calls on their own phones. An automated send on this
 * channel therefore never "sends" anything; it creates a call
 * task (status 'awaiting-staff') carrying the rendered script,
 * and the real call enters the log later when staff record it
 * through the manual call log. The channel is always configured
 * because the transport is the staff member.
 */
@Injectable()
export class ManualCallProvider extends CommunicationProvider {
  readonly channel = 'call' as const;

  isConfigured(): boolean {
    return true;
  }

  async send(_input: ProviderSendInput): Promise<ProviderSendResult> {
    return {
      status: 'awaiting-staff',
      providerMessageId: null,
      detail:
        'Call task created. A staff member places this call and logs the real outcome through the manual call log.',
    };
  }
}
