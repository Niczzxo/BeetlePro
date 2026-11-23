import type {
  CommunicationChannel,
  CommunicationLogStatus,
} from '@dostelo/types';

export interface ProviderSendInput {
  /** Phone number (WhatsApp, SMS) or email address. */
  to: string;
  subject: string | null;
  body: string;
}

export interface ProviderSendResult {
  /** Only 'sent' means the provider confirmed delivery to its
   * network. 'not-configured' and 'failed' never do. */
  status: Extract<
    CommunicationLogStatus,
    'sent' | 'not-configured' | 'failed' | 'awaiting-staff'
  >;
  providerMessageId: string | null;
  detail: string | null;
}

/**
 * One messaging channel adapter, following the payment provider
 * pattern: the registry routes a channel to its adapter, an
 * adapter whose credentials are absent reports not-configured,
 * and nothing is ever recorded as sent without a provider
 * success. Adapters are async because real sends are network
 * calls.
 */
export abstract class CommunicationProvider {
  abstract readonly channel: CommunicationChannel;
  /** Whether this adapter can run right now. */
  abstract isConfigured(): boolean;
  abstract send(
    input: ProviderSendInput,
  ): Promise<ProviderSendResult>;
}

export function notConfiguredResult(
  channel: CommunicationChannel,
  missing: string,
): ProviderSendResult {
  return {
    status: 'not-configured',
    providerMessageId: null,
    detail: `${channel} provider is not configured: ${missing} not set. No message was sent.`,
  };
}
