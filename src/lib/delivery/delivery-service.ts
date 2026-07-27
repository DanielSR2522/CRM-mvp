/**
 * Delivery orchestration.
 *
 * Ties together the four moving parts of sending a consent: mint a link, run the
 * channel adapter, record what actually happened, and move the request only if
 * something real occurred.
 *
 * The adapters decide *what happened*; this file decides *what we write down*.
 * Keeping those apart is what stops an adapter from being able to claim delivery
 * it cannot prove.
 */

import { supabase } from '@/lib/supabaseClient';
import type { DashboardConsentRow, DeliveryChannel } from '@/lib/consents/types';
import { issueSigningLink } from '@/lib/consents/link-service';
import { getPrimarySigner, setConsentStatus } from '@/lib/consents/request-service';
import { describeSupabaseError } from '@/lib/consents/template-service';
import type { DeliveryAdapter, DeliveryContext, DeliveryOutcome } from './types';
import { copyLinkAdapter } from './copy-link-adapter';
import { emailAdapter } from './email-adapter';
import { smsAdapter } from './sms-adapter';
import { whatsappAdapter } from './whatsapp-adapter';

export const ADAPTERS: Record<DeliveryChannel, DeliveryAdapter> = {
  email: emailAdapter,
  whatsapp: whatsappAdapter,
  sms: smsAdapter,
  copy_link: copyLinkAdapter,
};

export function adapterFor(channel: DeliveryChannel): DeliveryAdapter {
  return ADAPTERS[channel];
}

export interface DeliveryResult extends DeliveryOutcome {
  /** The freshly minted URL, so a dialog can offer a manual fallback. */
  signingUrl: string;
  expiresAt: Date;
}

/**
 * Builds the context an adapter needs.
 *
 * The link is minted here, once, and the same one is handed to whichever channel
 * runs. Minting inside each adapter would produce a different link per attempt
 * and quietly invalidate the previous one mid-flow.
 */
async function buildContext(
  row: DashboardConsentRow,
  agencyName: string | null,
  agentName: string | null,
  language: 'en' | 'es'
): Promise<DeliveryContext> {
  const signer = await getPrimarySigner(row.id);
  if (!signer) throw new Error('This consent has no signer.');

  const link = await issueSigningLink(row, { reason: 'delivery_requested' });

  return {
    requestId: row.id,
    signerId: signer.id,
    clientName: row.client_name ?? '',
    signerName: signer.full_name,
    signerEmail: signer.email,
    signerPhone: signer.phone,
    documentTitle: row.title,
    agencyName,
    agentName,
    signingUrl: link.url,
    expiresAt: link.expiresAt,
    language,
  };
}

/**
 * Records the attempt.
 *
 * Non-fatal on purpose: the message has already left, and failing the whole
 * operation because a log row would not insert would tell the agent their send
 * failed when it did not. A missing log line is recoverable; a client who never
 * receives a document because we lied about an error is not.
 */
async function recordAttempt(
  ctx: DeliveryContext,
  channel: DeliveryChannel,
  outcome: DeliveryOutcome
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const performedBy = userData?.user?.id ?? null;

  await supabase.from('signature_delivery_attempts').insert({
    request_id: ctx.requestId,
    signer_id: ctx.signerId,
    channel,
    // Masked. The full address lives on the signer row already; duplicating it
    // into a log adds exposure without adding information.
    destination: outcome.maskedDestination,
    status: outcome.status,
    provider_reference: outcome.providerReference ?? null,
    completed_at: outcome.status === 'failed' ? new Date().toISOString() : null,
    error_message: outcome.error ?? null,
    metadata: outcome.metadata ?? {},
  });

  await supabase.from('signature_events').insert({
    request_id: ctx.requestId,
    signer_id: ctx.signerId,
    performed_by: performedBy,
    event_type: outcome.eventType,
    channel,
    metadata: {
      // Never the URL, never the token — this row is readable by anyone who can
      // read the audit trail.
      delivery_status: outcome.status,
      ...(outcome.metadata ?? {}),
    },
  });
}

/**
 * Sends a consent through one channel.
 *
 * Sequence: mint link → run adapter → log → move status. The status only moves
 * when the adapter says something genuinely happened; opening WhatsApp is not
 * "sent", and `nextRequestStatus` is null for exactly that reason.
 */
export async function deliverConsent(
  row: DashboardConsentRow,
  channel: DeliveryChannel,
  options: {
    agencyName?: string | null;
    agentName?: string | null;
    language?: 'en' | 'es';
  } = {}
): Promise<DeliveryResult> {
  const adapter = adapterFor(channel);

  if (channel === 'email') {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error('Your session has expired. Sign in again.');
    }

    const response = await fetch(
      `/api/signature-requests/${encodeURIComponent(row.id)}/send-email`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const payload = (await response.json()) as {
      success?: boolean;
      message?: string;
      providerReference?: string;
      signingUrl?: string;
      expiresAt?: string;
      error?: string;
    };

    if (
      !response.ok ||
      !payload.success ||
      !payload.signingUrl ||
      !payload.expiresAt
    ) {
      throw new Error(payload.error ?? 'The email could not be sent.');
    }

    return {
      status: 'sent',
      eventType: 'email_sent',
      maskedDestination: null,
      nextRequestStatus: 'sent',
      message: payload.message ?? 'Email sent.',
      providerReference: payload.providerReference,
      metadata: {
        sent_at: new Date().toISOString(),
        handled_by_server: true,
      },
      signingUrl: payload.signingUrl,
      expiresAt: new Date(payload.expiresAt),
    };
  }

  const readiness = adapter.isReady();

  if (!readiness.ready) {
    throw new Error(
      readiness.reason ?? `${adapter.label} is not available.`
    );
  }

  const ctx = await buildContext(
    row,
    options.agencyName ?? null,
    options.agentName ?? null,
    options.language ?? 'en'
  );

  const valid = adapter.validate(ctx);

  if (!valid.ready) {
    throw new Error(
      valid.reason ?? `Cannot deliver via ${adapter.label}.`
    );
  }

  const outcome = await adapter.deliver(ctx);

  try {
    await recordAttempt(ctx, channel, outcome);
  } catch (err) {
    console.warn(
      'Delivery attempt could not be recorded:',
      err instanceof Error ? err.message : err
    );
  }

  await supabase
    .from('signature_requests')
    .update({ selected_delivery_channel: channel })
    .eq('id', row.id);

  if (outcome.nextRequestStatus) {
    try {
      await setConsentStatus(row.id, outcome.nextRequestStatus, {
        reason: `delivered_via_${channel}`,
      });
    } catch (err) {
      console.warn(
        'Status could not be advanced:',
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    ...outcome,
    signingUrl: ctx.signingUrl,
    expiresAt: ctx.expiresAt,
  };
}

/**
 * Marks a manual channel as actually sent.
 *
 * WhatsApp and SMS open an app; only the agent knows whether they pressed send.
 * This is that confirmation, and it is the only path by which a manual channel
 * can move a request to 'sent'. It is never inferred.
 */
export async function confirmManualSend(
  row: DashboardConsentRow,
  channel: DeliveryChannel
): Promise<void> {
  const signer = await getPrimarySigner(row.id);

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from('signature_events').insert({
    request_id: row.id,
    signer_id: signer?.id ?? null,
    performed_by: userData?.user?.id ?? null,
    event_type: 'request_sent',
    channel,
    metadata: { confirmed_manually: true },
  });
  if (error) throw new Error(describeSupabaseError(error));

  await setConsentStatus(row.id, row.status === 'draft' ? 'pending' : 'sent', {
    reason: `manually_confirmed_${channel}`,
  });

  // draft has to pass through pending on the way to sent — the state machine
  // allows draft→pending and pending→sent, but not draft→sent.
  if (row.status === 'draft') {
    await setConsentStatus(row.id, 'sent', { reason: `manually_confirmed_${channel}` });
  }
}
