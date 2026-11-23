import { Injectable } from '@nestjs/common';
import { whatsappCommConfig } from '../../../config/communications.config';
import {
  CommunicationProvider,
  notConfiguredResult,
  type ProviderSendInput,
  type ProviderSendResult,
} from './communication-provider';

/**
 * WhatsApp Business Cloud API adapter (Meta Graph API). Sends a
 * text message from the store's configured phone number id.
 * Without WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID the
 * adapter is not configured and reports exactly that; it never
 * pretends a message went out.
 */
@Injectable()
export class WhatsappProvider extends CommunicationProvider {
  readonly channel = 'whatsapp' as const;

  isConfigured(): boolean {
    return whatsappCommConfig().configured;
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const config = whatsappCommConfig();
    if (!config.configured) {
      return notConfiguredResult(
        'whatsapp',
        'WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are',
      );
    }
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'text',
            text: { body: input.body },
          }),
        },
      );
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          status: 'failed',
          providerMessageId: null,
          detail: `WhatsApp API answered ${response.status}: ${JSON.stringify(parsed)}`,
        };
      }
      const messageId =
        parsed &&
        typeof parsed === 'object' &&
        'messages' in parsed &&
        Array.isArray(parsed.messages) &&
        parsed.messages[0] &&
        typeof parsed.messages[0] === 'object' &&
        'id' in parsed.messages[0]
          ? String(parsed.messages[0].id)
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
        detail: `WhatsApp send failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
