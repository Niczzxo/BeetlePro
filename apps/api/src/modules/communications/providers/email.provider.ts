import { Injectable } from '@nestjs/common';
import { emailCommConfig } from '../../../config/communications.config';
import {
  CommunicationProvider,
  notConfiguredResult,
  type ProviderSendInput,
  type ProviderSendResult,
} from './communication-provider';

/**
 * Email adapter over a generic transactional HTTPS API: the
 * store configures EMAIL_PROVIDER_API_URL, EMAIL_PROVIDER_API_KEY
 * and EMAIL_FROM for whichever provider it contracts. The request
 * shape is the common denominator of those APIs (from, to,
 * subject, text with a bearer key). Without all three variables
 * the adapter is not configured and says so.
 */
@Injectable()
export class EmailProvider extends CommunicationProvider {
  readonly channel = 'email' as const;

  isConfigured(): boolean {
    return emailCommConfig().configured;
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const config = emailCommConfig();
    if (!config.configured) {
      return notConfiguredResult(
        'email',
        'EMAIL_PROVIDER_API_URL, EMAIL_PROVIDER_API_KEY and EMAIL_FROM are',
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
          from: config.fromAddress,
          to: input.to,
          subject: input.subject ?? '',
          text: input.body,
        }),
      });
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          status: 'failed',
          providerMessageId: null,
          detail: `Email API answered ${response.status}: ${JSON.stringify(parsed)}`,
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
        detail: `Email send failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
