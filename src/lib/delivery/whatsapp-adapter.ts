/**
 * WhatsApp — via wa.me, with no paid API.
 *
 * The agent's own WhatsApp does the sending. We open it with the message
 * pre-filled and record that the app was opened. We never claim delivery: the
 * agent might close the tab without pressing send, and a log that says
 * "delivered" when nobody sent anything is worse than no log at all.
 *
 * signature_delivery_attempts_manual_not_delivered_check enforces the same rule
 * in the database, so this cannot be gotten wrong by a future caller either.
 */

import type { DeliveryAdapter, DeliveryContext, DeliveryOutcome, ReadinessResult } from './types';
import { buildSigningMessage, maskPhone, normalizePhone } from './types';
import { LINK_ISSUANCE_BLOCKED_REASON, linkIssuanceReady } from './readiness';

export class WhatsAppDeliveryAdapter implements DeliveryAdapter {
  readonly channel = 'whatsapp' as const;
  readonly label = 'WhatsApp';

  isReady(): ReadinessResult {
    return linkIssuanceReady();
  }

  validate(ctx: DeliveryContext): ReadinessResult {
    if (!ctx.signerPhone?.trim()) {
      return { ready: false, reason: 'This signer has no phone number on file.' };
    }
    const digits = normalizePhone(ctx.signerPhone);
    if (digits.length < 10) {
      return {
        ready: false,
        reason: `"${ctx.signerPhone}" does not look like a complete phone number.`,
      };
    }
    return { ready: true };
  }

  /** The wa.me URL. Exposed so the UI can render a real link, not just a button. */
  buildUrl(ctx: DeliveryContext): string {
    const digits = normalizePhone(ctx.signerPhone ?? '');
    const message = buildSigningMessage(ctx);
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
    const readiness = this.isReady();
    if (!readiness.ready) {
      return this.failure(ctx, readiness.reason ?? LINK_ISSUANCE_BLOCKED_REASON);
    }

    const valid = this.validate(ctx);
    if (!valid.ready) {
      return this.failure(ctx, valid.reason ?? 'Cannot open WhatsApp for this signer.');
    }

    const url = this.buildUrl(ctx);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');

    if (!opened) {
      // Popup blockers are common enough that this is a normal outcome, not an
      // edge case. The dialog offers the link directly when this happens.
      return {
        status: 'failed',
        eventType: 'delivery_failed',
        maskedDestination: maskPhone(ctx.signerPhone),
        nextRequestStatus: null,
        message: 'The browser blocked the WhatsApp window. Use the link shown in the dialog instead.',
        error: 'popup_blocked',
      };
    }

    return {
      status: 'opened',
      eventType: 'whatsapp_link_opened',
      maskedDestination: maskPhone(ctx.signerPhone),
      // 'sent' is a claim about the client having been contacted, and opening an
      // app is not that. The agent confirms the send by hand from the dialog.
      nextRequestStatus: null,
      message: 'WhatsApp opened with the message ready. Press send there to deliver it.',
      metadata: { opened_at: new Date().toISOString(), transport: 'wa.me' },
    };
  }

  private failure(ctx: DeliveryContext, reason: string): DeliveryOutcome {
    return {
      status: 'failed',
      eventType: 'delivery_failed',
      maskedDestination: maskPhone(ctx.signerPhone),
      nextRequestStatus: null,
      message: reason,
      error: reason,
    };
  }
}

export const whatsappAdapter = new WhatsAppDeliveryAdapter();
