/**
 * Communication provider configuration, read from environment
 * variables at call time (never cached at import, never
 * committed), following the payments config pattern.
 *
 * There are no messaging credentials in this repository and none
 * may be invented. A channel whose variables are absent is simply
 * not configured: its provider reports not-configured and the
 * communication log records exactly that. Nothing is ever marked
 * sent without a configured provider confirming it.
 *
 * WhatsApp sends through the WhatsApp Business Cloud API
 * (Meta Graph API). Email and SMS send through a generic
 * transactional HTTPS API whose endpoint the store configures
 * (EMAIL_PROVIDER_API_URL / SMS_API_URL), because providers in
 * Bangladesh differ and no single vendor is assumed.
 */

export interface WhatsappCommConfig {
  accessToken: string | null;
  phoneNumberId: string | null;
  apiBaseUrl: string;
  configured: boolean;
}

export function whatsappCommConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsappCommConfig {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN || null;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || null;
  return {
    accessToken,
    phoneNumberId,
    apiBaseUrl:
      env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v21.0',
    configured: Boolean(accessToken && phoneNumberId),
  };
}

export interface EmailCommConfig {
  apiKey: string | null;
  apiUrl: string | null;
  fromAddress: string | null;
  configured: boolean;
}

export function emailCommConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmailCommConfig {
  const apiKey = env.EMAIL_PROVIDER_API_KEY || null;
  const apiUrl = env.EMAIL_PROVIDER_API_URL || null;
  const fromAddress = env.EMAIL_FROM || null;
  return {
    apiKey,
    apiUrl,
    fromAddress,
    configured: Boolean(apiKey && apiUrl && fromAddress),
  };
}

export interface SmsCommConfig {
  apiKey: string | null;
  apiUrl: string | null;
  senderId: string | null;
  configured: boolean;
}

export function smsCommConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmsCommConfig {
  const apiKey = env.SMS_API_KEY || null;
  const apiUrl = env.SMS_API_URL || null;
  const senderId = env.SMS_SENDER_ID || null;
  return {
    apiKey,
    apiUrl,
    senderId,
    configured: Boolean(apiKey && apiUrl && senderId),
  };
}
