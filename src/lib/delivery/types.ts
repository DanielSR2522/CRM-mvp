/**
 * Delivery adapters — shared contract.
 *
 * Every channel implements the same interface so the panel does not need to know
 * which one it is driving. What differs between them is not the shape but the
 * honesty: email can eventually be confirmed delivered by a provider, while
 * WhatsApp and SMS in this project are a link the agent opens by hand. The type
 * system reflects that — see DeliveryOutcome.
 *
 * STATUS: the adapters are structural only. None of them can run yet, because
 * every one needs a signing link and links cannot be issued until
 * migration_signatures_token_reissue.sql is applied. Each adapter reports that
 * through `isReady()` rather than pretending or throwing at a random moment.
 */

import type { DeliveryChannel, RequestStatus } from '@/lib/consents/types';

/** Everything an adapter needs. Assembled by the caller, never fetched here. */
export interface DeliveryContext {
  requestId: string;
  signerId: string;
  clientName: string;
  signerName: string;
  signerEmail: string | null;
  signerPhone: string | null;
  documentTitle: string;
  /** Who is asking — used in the message body, never a secret. */
  agencyName: string | null;
  agentName: string | null;
  /**
   * The full https://…/sign/<token> URL.
   *
   * Handed in already built. Adapters never see the raw token as a value and
   * never construct the URL themselves, so there is exactly one place that
   * touches tokens and it is not here.
   */
  signingUrl: string;
  expiresAt: Date;
  /** Only 'en' and 'es' exist, matching the template language CHECK. */
  language: 'en' | 'es';
}

/**
 * What actually happened, stated precisely.
 *
 * 'prepared'  — a message or link was built and handed to the agent. Nothing left
 *               this machine.
 * 'opened'    — an external app was opened with the message loaded. Proves the app
 *               opened, and nothing whatsoever about receipt.
 * 'sent'      — handed to a provider that accepted it.
 * 'delivered' — a provider confirmed receipt. Email only, and only once a provider
 *               exists. WhatsApp/SMS/copy_link can never report this — the CHECK
 *               signature_delivery_attempts_manual_not_delivered_check enforces it
 *               in the database as well.
 * 'failed'    — it did not work, and error says why.
 * 'unknown'   — genuinely cannot tell. Preferred over guessing.
 */
export type DeliveryOutcomeStatus = 'prepared' | 'opened' | 'sent' | 'delivered' | 'failed' | 'unknown';

export interface DeliveryOutcome {
  status: DeliveryOutcomeStatus;
  /** The signature_events type to record. */
  eventType:
    | 'request_sent'
    | 'email_sent'
    | 'email_failed'
    | 'whatsapp_link_opened'
    | 'sms_link_opened'
    | 'secure_link_copied'
    | 'delivery_failed';
  /**
   * Masked destination for the delivery log — 'j***@example.com', '***-***-1234'.
   * Never the full address: it already lives on the signer row, and a log that
   * duplicates PII adds exposure without adding information.
   */
  maskedDestination: string | null;
  /** The status the request should move to, or null to leave it alone. */
  nextRequestStatus: RequestStatus | null;
  /** Shown to the agent. Must never contain the token or the raw URL. */
  message: string;
  error?: string;
  /** Provider id, when a provider exists. */
  providerReference?: string;
  /** Extra context for signature_delivery_attempts.metadata. No secrets. */
  metadata?: Record<string, unknown>;
}

/** Why an adapter cannot run right now. */
export interface ReadinessResult {
  ready: boolean;
  reason?: string;
}

export interface DeliveryAdapter {
  readonly channel: DeliveryChannel;
  readonly label: string;

  /**
   * Whether this channel can be used at all in this deployment — configuration,
   * not per-request data. Email answers false until a provider is configured.
   */
  isReady(): ReadinessResult;

  /**
   * Whether this specific context can be delivered — a missing phone number, say.
   * Separate from isReady so the UI can tell "we don't support this" apart from
   * "this client is missing a field".
   */
  validate(ctx: DeliveryContext): ReadinessResult;

  /** Does the work. Only called when isReady and validate both pass. */
  deliver(ctx: DeliveryContext): Promise<DeliveryOutcome>;
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

/** j***@example.com — keeps the domain, which is the only useful part in a log. */
export function maskEmail(email: string | null): string | null {
  if (!email?.trim()) return null;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const head = local.slice(0, 1);
  return `${head}***${domain}`;
}

/** ***-***-1234 — the last four digits are enough to recognise a number. */
export function maskPhone(phone: string | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

/** MM/DD/YYYY, matching how every other date in this CRM reads. */
export function formatExpiry(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

/**
 * The message body shared by WhatsApp and SMS.
 *
 * Kept in one place because the two channels must say the same thing — a client
 * who gets both should not receive two different stories. Bilingual because the
 * template already carries a language and the client picked it.
 */
export function buildSigningMessage(ctx: DeliveryContext, compact = false): string {
  const from = ctx.agencyName || ctx.agentName || 'SmarTrack';
  const expiry = formatExpiry(ctx.expiresAt);

  if (ctx.language === 'es') {
    if (compact) {
      return `${ctx.signerName}: firme "${ctx.documentTitle}" de ${from}. Vence ${expiry}. ${ctx.signingUrl}`;
    }
    return [
      `Hola ${ctx.signerName},`,
      ``,
      `${from} le envía un documento para revisar y firmar: "${ctx.documentTitle}".`,
      ``,
      `Puede abrirlo aquí:`,
      ctx.signingUrl,
      ``,
      `Este enlace vence el ${expiry}.`,
    ].join('\n');
  }

  if (compact) {
    return `${ctx.signerName}: please sign "${ctx.documentTitle}" from ${from}. Expires ${expiry}. ${ctx.signingUrl}`;
  }
  return [
    `Hi ${ctx.signerName},`,
    ``,
    `${from} has sent you a document to review and sign: "${ctx.documentTitle}".`,
    ``,
    `You can open it here:`,
    ctx.signingUrl,
    ``,
    `This link expires on ${expiry}.`,
  ].join('\n');
}

/** Digits only, as wa.me and sms: both require. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
