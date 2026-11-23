import { Injectable } from '@nestjs/common';
import { smsCommConfig } from '../../../config/communications.config';
import {
  CommunicationProvider,
  notConfiguredResult,
  type ProviderSendInput,
  type ProviderSendResult,
} from './communication-provider';

/**
 * SMS adapter over a generic HTTPS gateway: the store configures
 * SMS_API_URL, SMS_API_KEY and SMS_SENDER_ID for its chosen
 * Bangladeshi gateway. Without all three the adapter is not
 * configured and says so.
 */
@Injectable()
export class SmsProvider extends CommunicationProvider {
  readonly channel = 'sms' as const;

  isConfigured(): boolean {
    return smsCommConfig().configured;
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const config = smsCommConfig();
    if (!config.configured) {
      return notConfiguredResult(
        'sms',
        'SMS_API_URL, SMS_API_KEY and SMS_SENDER_ID are',
      );
    }
    try {
      const response = await fetch(config.apiUrl as string, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          senderId: config.senderId,
          to: input.to,
          message: input.body,
        }),
      });
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          status: 'failed',
          providerMessageId: null,
          detail: `SMS API answered ${response.status}: ${JSON.stringify(parsed)}`,
        };
      }
      const messageId =
        parsed &&
        typeof parsed === 'object' &&
        'id' in parsed &&
        typeof parsed.id === 'string'
          ? parsed.id
          : null;
      return {
        status: 'sent',
        providerMessageId: messageId,
        detail: null,
      };
    } catch (error) {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: `SMS send failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
