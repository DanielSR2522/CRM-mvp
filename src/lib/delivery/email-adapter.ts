/**
 * Email — the integration point, with no provider behind it.
 *
 * This project has no mail service and none is being added. Rather than leave a
 * gap, this adapter builds the complete message — recipient, subject, body, link,
 * expiry — and then refuses to claim it went anywhere.
 *
 * That refusal is the feature. A consent that reports "sent" when nothing was
 * sent is how a client never receives a document and nobody finds out for a week.
 * The adapter returns a plain "Email provider not configured", records
 * email_failed, and leaves the request exactly where it was.
 *
 * TO INTEGRATE A PROVIDER LATER
 *   1. Implement `transport` below (Resend, SES, SMTP — anything).
 *   2. Send from a server route, never from here: an API key in a Client
 *      Component is a public API key.
 *   3. Return status 'sent' on acceptance, and 'delivered' only if the provider
 *      confirms receipt via webhook.
 *   Nothing else in the module needs to change.
 */

import type { DeliveryAdapter, DeliveryContext, DeliveryOutcome, ReadinessResult } from './types';
import { formatExpiry, maskEmail } from './types';
import { linkIssuanceReady } from './readiness';

/** The fully built message, ready for whatever transport arrives. */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. HTML is deliberately absent: nothing here needs markup. */
  body: string;
  signingUrl: string;
  expiresAt: Date;
}

/**
 * A transport that can actually put an email on the wire.
 *
 * Null until one is configured. Typed so the shape is settled now and the
 * decision is only which service, not how it plugs in.
 */
export type EmailTransport = ((message: EmailMessage) => Promise<{ id: string }>) | null;

const transport: EmailTransport = null;

export const EMAIL_NOT_CONFIGURED = 'Email provider not configured.';

export class EmailDeliveryAdapter implements DeliveryAdapter {
  readonly channel = 'email' as const;
  readonly label = 'Email';

  isReady(): ReadinessResult {
    // Two independent blockers; report the one the agent can act on first.
    const links = linkIssuanceReady();
    if (!links.ready) return links;

    if (transport === null) {
      return {
        ready: false,
        reason: `${EMAIL_NOT_CONFIGURED} No mail service is connected to this CRM, so consents cannot be emailed. Use WhatsApp, SMS or Copy Link instead.`,
      };
    }
    return { ready: true };
  }

  validate(ctx: DeliveryContext): ReadinessResult {
    if (!ctx.signerEmail?.trim()) {
      return { ready: false, reason: 'This signer has no email address on file.' };
    }
    // Deliberately loose. Strict email regexes reject valid addresses; the
    // provider is the real authority on deliverability.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.signerEmail.trim())) {
      return { ready: false, reason: `"${ctx.signerEmail}" does not look like an email address.` };
    }
    return { ready: true };
  }

  /**
   * Builds the message. Works today, provider or not — which is what makes the
   * dialog able to show the agent exactly what *would* be sent.
   */
  buildMessage(ctx: DeliveryContext): EmailMessage {
    const from = ctx.agencyName || ctx.agentName || 'SmarTrack';
    const expiry = formatExpiry(ctx.expiresAt);

    const subject =
      ctx.language === 'es'
        ? `Documento para firmar: ${ctx.documentTitle}`
        : `Document to sign: ${ctx.documentTitle}`;

    const body =
      ctx.language === 'es'
        ? [
            `Hola ${ctx.signerName},`,
            ``,
            `${from} le envía un documento para revisar y firmar electrónicamente:`,
            `"${ctx.documentTitle}"`,
            ``,
            `Abra el documento aquí:`,
            ctx.signingUrl,
            ``,
            `Este enlace vence el ${expiry}. No lo comparta con nadie más.`,
            ``,
            `Si no esperaba este mensaje, puede ignorarlo.`,
            ``,
            from,
          ].join('\n')
        : [
            `Hi ${ctx.signerName},`,
            ``,
            `${from} has sent you a document to review and sign electronically:`,
            `"${ctx.documentTitle}"`,
            ``,
            `Open the document here:`,
            ctx.signingUrl,
            ``,
            `This link expires on ${expiry}. Please do not share it with anyone else.`,
            ``,
            `If you were not expecting this message, you can ignore it.`,
            ``,
            from,
          ].join('\n');

    return {
      to: ctx.signerEmail?.trim() ?? '',
      subject,
      body,
      signingUrl: ctx.signingUrl,
      expiresAt: ctx.expiresAt,
    };
  }

  async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
    const readiness = this.isReady();
    if (!readiness.ready) {
      return {
        status: 'failed',
        eventType: 'email_failed',
        maskedDestination: maskEmail(ctx.signerEmail),
        // The request does not move. It was never sent.
        nextRequestStatus: null,
        message: readiness.reason ?? EMAIL_NOT_CONFIGURED,
        error: EMAIL_NOT_CONFIGURED,
        metadata: { reason: 'provider_not_configured' },
      };
    }

    const valid = this.validate(ctx);
    if (!valid.ready) {
      return {
        status: 'failed',
        eventType: 'email_failed',
        maskedDestination: maskEmail(ctx.signerEmail),
        nextRequestStatus: null,
        message: valid.reason ?? 'Cannot email this signer.',
        error: valid.reason,
      };
    }

    // Unreachable while transport is null; written so the day a provider lands,
    // the only change is the constant above.
    const message = this.buildMessage(ctx);
    try {
      const result = await transport!(message);
      return {
        status: 'sent',
        eventType: 'email_sent',
        maskedDestination: maskEmail(ctx.signerEmail),
        nextRequestStatus: 'sent',
        message: `Email sent to ${maskEmail(ctx.signerEmail)}.`,
        providerReference: result.id,
        metadata: { sent_at: new Date().toISOString() },
      };
    } catch (err) {
      return {
        status: 'failed',
        eventType: 'email_failed',
        maskedDestination: maskEmail(ctx.signerEmail),
        nextRequestStatus: 'failed',
        message: 'The email could not be sent. Try another channel.',
        error: err instanceof Error ? err.message : 'unknown_transport_error',
      };
    }
  }
}

export const emailAdapter = new EmailDeliveryAdapter();
