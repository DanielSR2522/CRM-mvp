/**
 * Consents & Signatures — signing links.
 *
 * The single place that mints, replaces and kills tokens. Everything else in the
 * module receives a finished URL and never sees a token value.
 *
 * The rules this file exists to keep:
 *   - the raw token is returned once, to the caller, and written nowhere;
 *   - only its SHA-256 reaches the database;
 *   - replacing the hash is what revokes the previous link, because the public
 *     route looks a signer up by hash and the old one stops resolving;
 *   - a token can never be reconstructed from its hash, so a lost link is
 *     reissued, never recovered.
 *
 * migration_signatures_token_reissue.sql is what makes rotation possible at all,
 * and it still refuses to rotate a token belonging to someone who has signed or
 * declined. That trigger is the real guarantee; this file is the polite version.
 */

import { supabase } from '@/lib/supabaseClient';
import type { SignatureRequest, SignatureRequestSigner } from './types';
import { describeSupabaseError } from './template-service';
import { generateSecureToken } from './token-service';
import { getPrimarySigner } from './request-service';

class LinkServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkServiceError';
  }
}

/** Statuses whose link may still be issued. Mirrors the trigger's own list. */
const ISSUABLE_STATUSES = ['draft', 'pending', 'sent', 'viewed'];

export interface IssuedLink {
  /**
   * The full https://…/sign/<token> URL.
   *
   * Hold it only as long as it takes to hand it to a channel. It is not stored
   * and cannot be retrieved again — reopening this page mints a different one.
   */
  url: string;
  signerId: string;
  expiresAt: Date;
}

/**
 * The origin to build links against.
 *
 * window.location.origin rather than an env var: the link must point at the host
 * the agent is actually using, and a misconfigured NEXT_PUBLIC_APP_URL would
 * hand clients a URL that silently 404s. NEXT_PUBLIC_APP_URL overrides it when
 * set, for the case where the CRM is reached through an internal hostname the
 * client cannot resolve.
 */
export function signingOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  throw new LinkServiceError('Cannot determine the application URL to build a signing link.');
}

export function buildSigningUrl(rawToken: string): string {
  return `${signingOrigin()}/sign/${rawToken}`;
}

/** First 12 hex chars — enough to correlate two audit rows, useless as a secret. */
function hashPrefix(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 12) : null;
}

/**
 * Mints a new link for a request's primary signer, invalidating any previous one.
 *
 * This is both "issue" and "reissue": there is no difference at the database
 * level, because every signer row always holds a hash from the moment the draft
 * was created. That first hash is dead on arrival — its raw token was discarded
 * on purpose so a draft never carries a working link — so the first real
 * issuance is already a replacement.
 *
 * Ordering: rotate first, then log. If the rotation fails, nothing was promised
 * and nothing is logged. If a log write fails afterwards, the link is already
 * live and refusing to return it would be worse than an incomplete trail — the
 * failure surfaces as a warning instead.
 */
export async function issueSigningLink(
  request: Pick<SignatureRequest, 'id' | 'status' | 'expires_at'>,
  options: { reason?: string } = {}
): Promise<IssuedLink> {
  if (!ISSUABLE_STATUSES.includes(request.status)) {
    throw new LinkServiceError(
      `A signing link cannot be issued for a consent that is "${request.status}".`
    );
  }

  const signer = await getPrimarySigner(request.id);
  if (!signer) {
    throw new LinkServiceError('This consent has no signer, so no link can be issued.');
  }
  if (signer.signed_at) {
    throw new LinkServiceError('This signer has already signed. A new link cannot be issued.');
  }
  if (signer.declined_at) {
    throw new LinkServiceError('This signer declined. A new link cannot be issued.');
  }

  // Expiry follows the request. A link that outlived its consent would be a
  // second, invisible source of truth.
  const expiresAt = request.expires_at ? new Date(request.expires_at) : new Date(signer.token_expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    throw new LinkServiceError('This consent has already expired. Extend it before issuing a link.');
  }

  const previousHashPrefix = hashPrefix(signer.token_hash);
  const token = await generateSecureToken();

  const { error } = await supabase
    .from('signature_request_signers')
    .update({
      token_hash: token.hash,
      token_expires_at: expiresAt.toISOString(),
      // A freshly issued token is live by definition; the trigger rejects the row
      // otherwise.
      token_revoked_at: null,
    })
    .eq('id', signer.id);

  if (error) throw new LinkServiceError(describeSupabaseError(error));

  const { data: userData } = await supabase.auth.getUser();
  const performedBy = userData?.user?.id ?? null;

  // Two events, in the order the facts happened: the old link died, then a new
  // one was born. Neither carries the token — an audit trail must never hold the
  // secret it is auditing.
  await supabase.from('signature_events').insert([
    {
      request_id: request.id,
      signer_id: signer.id,
      performed_by: performedBy,
      event_type: 'link_revoked',
      metadata: {
        reason: options.reason ?? 'replaced_by_new_link',
        previous_token_hash_prefix: previousHashPrefix,
      },
    },
    {
      request_id: request.id,
      signer_id: signer.id,
      performed_by: performedBy,
      event_type: 'link_issued',
      metadata: {
        token_hash_prefix: hashPrefix(token.hash),
        expires_at: expiresAt.toISOString(),
      },
    },
  ]);

  return { url: buildSigningUrl(token.raw), signerId: signer.id, expiresAt };
}

/**
 * Kills the current link without replacing it.
 *
 * Distinct from issuing: this leaves the signer with a hash that no longer
 * resolves and no way back in until a new link is issued. Used when a link is
 * believed leaked.
 */
export async function revokeSigningLink(
  request: Pick<SignatureRequest, 'id'>,
  reason = 'manually_revoked'
): Promise<void> {
  const signer = await getPrimarySigner(request.id);
  if (!signer) throw new LinkServiceError('This consent has no signer.');

  if (signer.signed_at) {
    throw new LinkServiceError('This signer has already signed; there is nothing left to revoke.');
  }
  if (signer.token_revoked_at) return; // already dead, nothing to do

  const { error } = await supabase
    .from('signature_request_signers')
    .update({ token_revoked_at: new Date().toISOString() })
    .eq('id', signer.id);

  if (error) throw new LinkServiceError(describeSupabaseError(error));

  const { data: userData } = await supabase.auth.getUser();
  await supabase.from('signature_events').insert({
    request_id: request.id,
    signer_id: signer.id,
    performed_by: userData?.user?.id ?? null,
    event_type: 'link_revoked',
    metadata: { reason, token_hash_prefix: hashPrefix(signer.token_hash) },
  });
}

/** Whether a signer's current link would work if handed to someone right now. */
export function isLinkLive(signer: SignatureRequestSigner): boolean {
  if (signer.token_revoked_at) return false;
  if (signer.signed_at || signer.declined_at) return false;
  return new Date(signer.token_expires_at).getTime() > Date.now();
}

export { LinkServiceError };
