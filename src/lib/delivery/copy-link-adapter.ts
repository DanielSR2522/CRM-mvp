/**
 * Copy Link — the cheapest channel there is.
 *
 * The agent gets the URL on their clipboard and delivers it however they like.
 * We record that a link was copied and nothing more, because that is genuinely
 * all we know.
 */

import type { DeliveryAdapter, DeliveryContext, DeliveryOutcome, ReadinessResult } from './types';
import { LINK_ISSUANCE_BLOCKED_REASON, linkIssuanceReady } from './readiness';

export class CopyLinkDeliveryAdapter implements DeliveryAdapter {
  readonly channel = 'copy_link' as const;
  readonly label = 'Copy Link';

  isReady(): ReadinessResult {
    return linkIssuanceReady();
  }

  /** A link needs no contact details, so there is nothing per-request to check. */
  validate(): ReadinessResult {
    return { ready: true };
  }

  async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
    const readiness = this.isReady();
    if (!readiness.ready) {
      return {
        status: 'failed',
        eventType: 'delivery_failed',
        maskedDestination: null,
        nextRequestStatus: null,
        message: readiness.reason ?? LINK_ISSUANCE_BLOCKED_REASON,
        error: readiness.reason,
      };
    }

    try {
      await navigator.clipboard.writeText(ctx.signingUrl);
    } catch {
      // Clipboard access is denied outside a user gesture and on insecure
      // origins. Failing loudly is better than a silent no-op that leaves the
      // agent thinking they have the link.
      return {
        status: 'failed',
        eventType: 'delivery_failed',
        maskedDestination: null,
        nextRequestStatus: null,
        message: 'Could not access the clipboard. Copy the link manually from the dialog.',
        error: 'clipboard_denied',
      };
    }

    return {
      status: 'prepared',
      eventType: 'secure_link_copied',
      // There is no destination: the agent is the recipient.
      maskedDestination: null,
      // Copying is not sending. The request stays where it was, because we have
      // no idea whether the agent ever pasted it anywhere.
      nextRequestStatus: null,
      message: 'Secure link copied. It works until the expiration date.',
      metadata: { copied_at: new Date().toISOString() },
    };
  }
}

export const copyLinkAdapter = new CopyLinkDeliveryAdapter();
