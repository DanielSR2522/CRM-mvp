/**
 * WhatsApp Cloud API — server-only helper.
 *
 * Single server-side module for Meta's Graph API integration.
 * Nothing in this module may be imported from a Client Component.
 *
 * REQUIRED ENVIRONMENT VARIABLES:
 *   Outbound Send:
 *     - WHATSAPP_ACCESS_TOKEN         (Meta permanent system user token)
 *     - WHATSAPP_PHONE_NUMBER_ID       (Meta WhatsApp Business Phone Number ID)
 *     - WHATSAPP_BUSINESS_ACCOUNT_ID   (Meta WhatsApp Business Account ID, optional)
 *     - WHATSAPP_API_VERSION          (Graph API version, e.g. v20.0 — required, no silent fallback)
 *     - WHATSAPP_TEMPLATE_ES          (Spanish template name, default: health_consent_signature_request)
 *     - WHATSAPP_TEMPLATE_ES_LANGUAGE (Spanish locale code, default: es_CO)
 *     - WHATSAPP_TEMPLATE_EN          (English template name, default: health_consent_ingles)
 *     - WHATSAPP_TEMPLATE_EN_LANGUAGE (English locale code, default: en)
 *
 *   Webhook Verification & Security:
 *     - WHATSAPP_APP_SECRET           (App Secret for HMAC-SHA256 signature verification)
 *     - WHATSAPP_VERIFY_TOKEN          (Custom secret string for GET hub verification)
 *
 * PHONE NORMALISATION:
 *   Converts phone strings to E.164 format (+CCXXXXXXXXXX).
 *   Preserves explicit country codes starting with +.
 *   Adds +1 to 10-digit US numbers. Rejects invalid or ambiguous formats.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/whatsapp/cloud-api.ts was imported into browser code. ' +
    'This module holds WhatsApp access tokens and must only be used on the server.'
  );
}

// ---------------------------------------------------------------------------
// Configuration Interfaces & Central Validation
// ---------------------------------------------------------------------------

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  apiVersion: string;
  templateEs: string;
  templateEsLanguage: string;
  templateEn: string;
  templateEnLanguage: string;
}

export interface WhatsAppWebhookConfig {
  appSecret: string;
  verifyToken: string;
}

/**
 * Validates and returns outbound WhatsApp Cloud API configuration.
 * Throws WhatsAppConfigError if required environment variables are missing.
 * No silent API version fallback — WHATSAPP_API_VERSION must be explicitly set.
 */
export function getWhatsAppConfig(): WhatsAppConfig {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null;

  const missing: string[] = [];
  if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!apiVersion) missing.push('WHATSAPP_API_VERSION');

  if (missing.length > 0) {
    throw new WhatsAppConfigError(
      `WhatsApp Cloud API is not fully configured. Missing required variable(s): ${missing.join(', ')}. ` +
      'Add these to .env.local — see .env.example for details.'
    );
  }

  return {
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    businessAccountId,
    apiVersion: apiVersion!,
    templateEs:
      process.env.WHATSAPP_TEMPLATE_ES?.trim() ||
      'health_consent_signature_request',
    templateEsLanguage:
      process.env.WHATSAPP_TEMPLATE_ES_LANGUAGE?.trim() || 'es_CO',
    templateEn:
      process.env.WHATSAPP_TEMPLATE_EN?.trim() ||
      'health_consent_ingles',
    templateEnLanguage:
      process.env.WHATSAPP_TEMPLATE_EN_LANGUAGE?.trim() || 'en',
  };
}

/**
 * Validates and returns webhook configuration for security checks.
 * Returns null if webhook credentials are not configured.
 */
export function getWhatsAppWebhookConfig(): WhatsAppWebhookConfig | null {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (!appSecret || !verifyToken) return null;

  return { appSecret, verifyToken };
}

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

export function normalizeToE164(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  const trimmed = phone.trim();

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Template selection & language code resolution
// ---------------------------------------------------------------------------

export function selectTemplateName(
  config: WhatsAppConfig,
  language: 'en' | 'es'
): string {
  return language === 'es' ? config.templateEs : config.templateEn;
}

export function selectLanguageCode(
  config: WhatsAppConfig,
  language: 'en' | 'es'
): string {
  return language === 'es' ? config.templateEsLanguage : config.templateEnLanguage;
}

// ---------------------------------------------------------------------------
// Meta Graph API Call
// ---------------------------------------------------------------------------

export interface SendConsentParams {
  config: WhatsAppConfig;
  toPhone: string;
  templateName: string;
  language: 'en' | 'es';
  clientName: string;
  agentName: string;
  consentLink: string;
}

export interface SendConsentResult {
  messageId: string;
}

export async function sendConsentWhatsAppTemplate(
  params: SendConsentParams
): Promise<SendConsentResult> {
  const { config, toPhone, templateName, language, clientName, agentName, consentLink } = params;

  // Exact Graph API URL format: https://graph.facebook.com/<WHATSAPP_API_VERSION>/<WHATSAPP_PHONE_NUMBER_ID>/messages
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  const languageCode = selectLanguageCode(config, language);

  const body = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'client_name', text: clientName },
            { type: 'text', parameter_name: 'agent_name', text: agentName },
            { type: 'text', parameter_name: 'consent_link', text: consentLink },
          ],
        },
      ],
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error';
    throw new WhatsAppApiError(
      `Could not reach the WhatsApp Cloud API: ${reason}`,
      0,
      null
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new WhatsAppApiError(
      `WhatsApp Cloud API returned a non-JSON response (HTTP ${response.status}).`,
      response.status,
      null
    );
  }

  if (!response.ok) {
    const metaError = extractMetaError(json);
    throw new WhatsAppApiError(
      buildSafeErrorMessage(response.status, metaError),
      response.status,
      metaError
    );
  }

  const messageId = extractMessageId(json);
  if (!messageId) {
    throw new WhatsAppApiError(
      'WhatsApp Cloud API returned a success status but no message ID. ' +
      'The message state is unknown — treating as failure to avoid a false-success audit trail.',
      response.status,
      json
    );
  }

  return { messageId };
}

// ---------------------------------------------------------------------------
// Webhook Signature Validation
// ---------------------------------------------------------------------------

export async function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    console.error(
      '[whatsapp-webhook] WHATSAPP_APP_SECRET is not set; webhook signature cannot be validated.'
    );
    return false;
  }

  if (!signatureHeader?.startsWith('sha256=')) return false;
  const receivedHex = signatureHeader.slice('sha256='.length);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
    const expectedHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return timingSafeEqual(expectedHex, receivedHex);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppConfigError';
  }
}

export class WhatsAppApiError extends Error {
  readonly httpStatus: number;
  readonly rawMetaError: unknown;

  constructor(message: string, httpStatus: number, rawMetaError: unknown) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.httpStatus = httpStatus;
    this.rawMetaError = rawMetaError;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

interface MetaErrorDetail {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

function extractMetaError(body: unknown): MetaErrorDetail | null {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    return body.error as MetaErrorDetail;
  }
  return null;
}

function extractMessageId(body: unknown): string | null {
  try {
    const obj = body as {
      messages?: Array<{ id?: string }>;
    };
    return obj?.messages?.[0]?.id?.trim() || null;
  } catch {
    return null;
  }
}

function buildSafeErrorMessage(httpStatus: number, metaError: MetaErrorDetail | null): string {
  const code = metaError?.code;

  if (httpStatus === 400 && (code === 132000 || code === 132001)) {
    return 'The WhatsApp message template has not been approved by Meta yet. Use the manual link below to send it until approval is confirmed.';
  }

  if (httpStatus === 401 || (httpStatus === 400 && code === 190)) {
    return 'The WhatsApp Cloud API access token has expired or is invalid. Contact your administrator.';
  }

  if (httpStatus === 403) {
    return 'The WhatsApp Cloud API access was denied. Contact your administrator to check the Meta app permissions.';
  }
  if (httpStatus === 429) {
    return 'WhatsApp has rate-limited this account. Please wait a few minutes and try again.';
  }

  if (httpStatus >= 500) {
    return 'WhatsApp Cloud API is temporarily unavailable. Please try again in a few minutes.';
  }

  return `WhatsApp could not send the message (HTTP ${httpStatus}). Please try again or use the manual link.`;
}
