/**
 * SMS — via the sms: URI scheme, with no paid gateway.
 *
 * The agent's own phone or messaging app does the sending. Same honesty rule as
 * WhatsApp: opening a composer is not delivery.
 *
 * On a desktop without a paired messaging app the sms: link does nothing at all,
 * silently. That is the worst possible failure — the agent thinks it worked. So
 * this adapter reports whether it expects the link to work, and the dialog falls
 * back to showing the number and the message for manual copying.
 */

import type { DeliveryAdapter, DeliveryContext, DeliveryOutcome, ReadinessResult } from './types';
import { buildSigningMessage, maskPhone, normalizePhone } from './types';
import { LINK_ISSUANCE_BLOCKED_REASON, linkIssuanceReady } from './readiness';

export class SmsDeliveryAdapter implements DeliveryAdapter {
  readonly channel = 'sms' as const;
  readonly label = 'SMS';

  isReady(): ReadinessResult {
    return linkIssuanceReady();
  }

  validate(ctx: DeliveryContext): ReadinessResult {
    if (!ctx.signerPhone?.trim()) {
      return { ready: false, reason: 'This signer has no phone number on file.' };
    }
    if (normalizePhone(ctx.signerPhone).length < 10) {
      return {
        ready: false,
        reason: `"${ctx.signerPhone}" does not look like a complete phone number.`,
      };
    }
    return { ready: true };
  }

  /**
   * Whether an sms: link is likely to do anything here.
   *
   * User-agent sniffing is unreliable by nature, which is exactly why this only
   * decides what to *show*, never what to record. Desktop agents get the manual
   * fallback; if the guess is wrong, the fallback still works.
   */
  isLikelyMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  }

  /**
   * The sms: URI.
   *
   * iOS historically wanted `&body=` and Android `?body=`; modern iOS accepts
   * `?body=` too, so the single form is used rather than sniffing further.
   * The body is compact because SMS is billed by length.
   */
  buildUrl(ctx: DeliveryContext): string {
    const digits = normalizePhone(ctx.signerPhone ?? '');
    const message = buildSigningMessage(ctx, true);
    return `sms:${digits}?body=${encodeURIComponent(message)}`;
  }

  /** The plain-text message, for the Copy Message button on desktop. */
  buildMessage(ctx: DeliveryContext): string {
    return buildSigningMessage(ctx, true);
  }

  async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
    const readiness = this.isReady();
    if (!readiness.ready) {
      return this.failure(ctx, readiness.reason ?? LINK_ISSUANCE_BLOCKED_REASON);
    }

    const valid = this.validate(ctx);
    if (!valid.ready) {
      return this.failure(ctx, valid.reason ?? 'Cannot open SMS for this signer.');
    }

    if (!this.isLikelyMobile()) {
      // Do not fire an sms: link into the void. Report it as prepared and let the
      // dialog offer the number, the message and the link for manual sending.
      return {
        status: 'prepared',
        eventType: 'sms_link_opened',
        maskedDestination: maskPhone(ctx.signerPhone),
        nextRequestStatus: null,
        message: 'SMS links only open on a phone. Copy the message and send it from your device.',
        metadata: { prepared_at: new Date().toISOString(), transport: 'manual', surface: 'desktop' },
      };
    }

    window.location.href = this.buildUrl(ctx);

    return {
      status: 'opened',
      eventType: 'sms_link_opened',
      maskedDestination: maskPhone(ctx.signerPhone),
      nextRequestStatus: null,
      message: 'Your messaging app opened with the text ready. Press send there to deliver it.',
      metadata: { opened_at: new Date().toISOString(), transport: 'sms:', surface: 'mobile' },
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

export const smsAdapter = new SmsDeliveryAdapter();
