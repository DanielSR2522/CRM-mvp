/**
 * Consents & Signatures — request state machine.
 *
 * One place that answers "can this go from A to B?" and "what can I do with this
 * row?", so the panel, the client tab and the future server routes cannot drift
 * apart on the answer.
 *
 * This mirrors, and never replaces, the database guard. Postgres already refuses
 * to reopen signed/declined/cancelled via signature_requests_guard_transitions_trg.
 * This layer exists so the UI shows the right buttons and gives a sentence
 * instead of a trigger exception.
 */

import type { DeliveryChannel, RequestStatus, SignatureRequest } from './types';

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * The only legal moves. Anything absent is forbidden.
 *
 * Terminal by design: signed, declined, cancelled. Their arrays are empty and
 * must stay that way — a signed consent that can become something else is not
 * evidence of anything.
 *
 * 'failed' can retry back to pending: it means a delivery attempt failed, not
 * that the document is void.
 */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['sent', 'cancelled', 'failed'],
  sent: ['viewed', 'signed', 'declined', 'expired', 'cancelled', 'failed'],
  viewed: ['signed', 'declined', 'expired', 'cancelled'],
  signed: [],
  declined: [],
  cancelled: [],
  expired: ['cancelled'],
  failed: ['pending', 'cancelled'],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: RequestStatus): RequestStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Reached the end of the road: nothing further can happen to it. */
export function isTerminal(status: RequestStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

/** The consent is alive and a signer could still act on it. */
export function isLive(status: RequestStatus): boolean {
  return status === 'draft' || status === 'pending' || status === 'sent' || status === 'viewed';
}

/**
 * A readable refusal. Returns null when the move is legal.
 * The wording explains *why*, because "invalid transition" tells an agent nothing.
 */
export function explainTransition(from: RequestStatus, to: RequestStatus): string | null {
  if (canTransition(from, to)) return null;

  if (isTerminal(from)) {
    const reason: Record<string, string> = {
      signed: 'it has already been signed',
      declined: 'the client declined it',
      cancelled: 'it was cancelled',
    };
    return `This consent cannot change: ${reason[from] ?? 'it is closed'}.`;
  }
  return `A consent cannot go from "${from}" to "${to}".`;
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/**
 * Whether a request is past its expiry but not yet marked expired.
 *
 * Expiry is computed rather than swept by a scheduled job: a cron would be
 * infrastructure this project does not have, and the answer is a comparison the
 * database can index (signature_requests_expiry_idx covers exactly this).
 */
export function isPastExpiry(request: Pick<SignatureRequest, 'status' | 'expires_at'>): boolean {
  if (!request.expires_at) return false;
  if (request.status !== 'sent' && request.status !== 'viewed') return false;
  return new Date(request.expires_at).getTime() < Date.now();
}

/**
 * The status to show. A request whose expiry has passed reads as expired even if
 * no write has marked it yet — the UI must not claim a dead link is live.
 */
export function effectiveStatus(
  request: Pick<SignatureRequest, 'status' | 'expires_at'>
): RequestStatus {
  return isPastExpiry(request) ? 'expired' : request.status;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ConsentAction =
  | 'view'
  | 'preview'
  | 'continue_draft'
  | 'send'
  | 'whatsapp'
  | 'sms'
  | 'copy_link'
  | 'cancel'
  | 'download'
  | 'audit_trail';

export interface ActionAvailability {
  action: ConsentAction;
  label: string;
  /** False when the action exists for this status but cannot run right now. */
  enabled: boolean;
  /** Why it is disabled. Shown as a tooltip. */
  reason?: string;
  /** Actions that end something, styled apart and confirmed before running. */
  destructive?: boolean;
}

export interface ActionContext {
  request: Pick<
    SignatureRequest,
    'status' | 'expires_at' | 'final_file_path' | 'final_document_status'
  >;
  signerEmail?: string | null;
  signerPhone?: string | null;
  /** Set while the delivery layer is not wired up yet. */
  deliveryReady?: boolean;
}

/**
 * The actions worth offering for one row, in the order they should appear.
 *
 * Actions that make no sense for a status are omitted entirely rather than shown
 * greyed out — a menu of eight dead options is noise. Actions that fit the status
 * but lack a precondition (no email on file, say) stay visible and disabled, so
 * the agent learns what is missing instead of wondering where the button went.
 */
export function availableActions(ctx: ActionContext): ActionAvailability[] {
  const status = effectiveStatus(ctx.request);
  const actions: ActionAvailability[] = [];

  const deliveryBlocked = ctx.deliveryReady === false;
  const deliveryReason = 'Sending is not available yet.';

  // ---- Always ----------------------------------------------------------
  if (status === 'draft') {
    actions.push({ action: 'continue_draft', label: 'Continue Draft', enabled: true });
  } else {
    actions.push({ action: 'view', label: 'View', enabled: true });
  }
  actions.push({ action: 'preview', label: 'Preview', enabled: true });

  // ---- Delivery, only while the consent can still be acted on ----------
  if (status === 'draft' || status === 'pending' || status === 'failed') {
    actions.push({
      action: 'send',
      label: 'Send by Email',
      enabled: !deliveryBlocked && Boolean(ctx.signerEmail?.trim()),
      reason: deliveryBlocked
        ? deliveryReason
        : ctx.signerEmail?.trim()
          ? undefined
          : 'This signer has no email address.',
    });
  }

  if (status === 'draft' || status === 'pending' || status === 'sent' || status === 'viewed' || status === 'failed') {
    actions.push({
      action: 'whatsapp',
      label: 'WhatsApp',
      enabled: !deliveryBlocked && Boolean(ctx.signerPhone?.trim()),
      reason: deliveryBlocked
        ? deliveryReason
        : ctx.signerPhone?.trim()
          ? undefined
          : 'This signer has no phone number.',
    });
    actions.push({
      action: 'sms',
      label: 'SMS',
      enabled: !deliveryBlocked && Boolean(ctx.signerPhone?.trim()),
      reason: deliveryBlocked
        ? deliveryReason
        : ctx.signerPhone?.trim()
          ? undefined
          : 'This signer has no phone number.',
    });
    actions.push({
      action: 'copy_link',
      label: 'Copy Link',
      enabled: !deliveryBlocked,
      reason: deliveryBlocked ? deliveryReason : undefined,
    });
  }

  // ---- Download, once there is something to download --------------------
  if (status === 'signed') {
    const ready = ctx.request.final_document_status === 'generated' && Boolean(ctx.request.final_file_path);
    actions.push({
      action: 'download',
      label: 'Download',
      enabled: ready,
      reason: ready
        ? undefined
        : ctx.request.final_document_status === 'failed'
          ? 'The signed PDF could not be generated. Retry from the consent.'
          : 'The signed PDF is still being generated.',
    });
  }

  // ---- Audit --------------------------------------------------------------
  actions.push({ action: 'audit_trail', label: 'Audit Trail', enabled: true });

  // ---- Cancel, last and destructive --------------------------------------
  if (canTransition(status, 'cancelled')) {
    actions.push({
      action: 'cancel',
      label: 'Cancel',
      enabled: true,
      destructive: true,
    });
  }

  return actions;
}

/** The one action a row click should perform. */
export function primaryAction(ctx: ActionContext): ConsentAction {
  return effectiveStatus(ctx.request) === 'draft' ? 'continue_draft' : 'view';
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  copy_link: 'Link',
};

export function channelLabel(channel: string | null): string {
  if (!channel) return '—';
  return CHANNEL_LABELS[channel as DeliveryChannel] ?? channel;
}

/** The channel a given action delivers through, if any. */
export function actionChannel(action: ConsentAction): DeliveryChannel | null {
  switch (action) {
    case 'send':
      return 'email';
    case 'whatsapp':
      return 'whatsapp';
    case 'sms':
      return 'sms';
    case 'copy_link':
      return 'copy_link';
    default:
      return null;
  }
}
