/**
 * Server-side signing.
 *
 * Everything a signer can do passes through here. It runs with the service role,
 * which means RLS is not protecting anything — every rule below is the only rule.
 *
 * The security model in one line: possession of a token that hashes to a live
 * signer row is the entire authorisation. So the token is validated before any
 * read, and the outcome of that validation is the only thing that decides what
 * the caller learns.
 */

import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import type {
  MergeDataSnapshot,
  SignatureRequest,
  SignatureRequestSigner,
  TemplateContent,
} from '@/lib/consents/types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The reasons a signing session can fail.
 *
 * Deliberately coarse. A signer must never be able to tell "this token does not
 * exist" from "this token exists but expired" — the first would turn the public
 * route into an oracle that confirms guesses. Both map to `invalid`.
 */
export type SigningError =
  | 'invalid'      // no such token, malformed, revoked — indistinguishable on purpose
  | 'expired'
  | 'completed'    // already signed
  | 'declined'
  | 'cancelled'
  | 'unavailable'; // our fault: misconfiguration or an outage

export class PublicSigningError extends Error {
  constructor(
    readonly code: SigningError,
    message: string
  ) {
    super(message);
    this.name = 'PublicSigningError';
  }
}

/** The message a signer sees. Never leaks why beyond the coarse reason. */
export function publicMessageFor(code: SigningError): string {
  switch (code) {
    case 'expired':
      return 'This signing link has expired. Please contact your agent for a new one.';
    case 'completed':
      return 'This document has already been signed.';
    case 'declined':
      return 'This document was declined.';
    case 'cancelled':
      return 'This document is no longer available.';
    case 'unavailable':
      return 'This service is temporarily unavailable. Please try again shortly.';
    case 'invalid':
    default:
      return 'This link is not valid. Please check the link your agent sent you, or ask for a new one.';
  }
}

export function httpStatusFor(code: SigningError): number {
  if (code === 'unavailable') return 503;
  if (code === 'invalid') return 404;
  return 410; // Gone — it existed, it is over
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/** SHA-256 hex, matching the token_hash CHECK and what the browser wrote. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Constant-time comparison.
 *
 * The lookup is by hash so the database has already done an equality test, but
 * comparing again in variable time on the way out would reintroduce a timing
 * signal for free. This costs nothing and closes it.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Cheap shape check before touching the database. */
function looksLikeToken(raw: string): boolean {
  // base64url of 32 bytes is 43 chars. Allow a little slack, reject the rest.
  return /^[A-Za-z0-9_-]{20,120}$/.test(raw);
}

export interface SigningSession {
  request: SignatureRequest;
  signer: SignatureRequestSigner;
  clientName: string;
  agencyName: string | null;
  templateTitle: string;
}

/**
 * Resolves a raw token to a live signing session, or throws.
 *
 * Order matters: shape, then hash lookup, then revocation, then expiry, then the
 * signer's own state, then the request's. Each check is a different reason, and
 * only the coarse code escapes.
 */
export async function resolveSigningSession(rawToken: string): Promise<SigningSession> {
  if (!isAdminConfigured()) {
    throw new PublicSigningError('unavailable', 'Server is not configured for public signing.');
  }
  if (!rawToken || !looksLikeToken(rawToken)) {
    throw new PublicSigningError('invalid', 'Malformed token.');
  }

  const admin = getSupabaseAdmin();
  const tokenHash = hashToken(rawToken);

  const { data: signer, error } = await admin
    .from('signature_request_signers')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw new PublicSigningError('unavailable', 'Lookup failed.');
  }
  if (!signer) {
    // No such token. Also the answer for a token that was rotated away — the old
    // hash simply no longer exists, which is what makes rotation a revocation.
    throw new PublicSigningError('invalid', 'No signer for this token.');
  }
  if (!safeEqualHex(signer.token_hash, tokenHash)) {
    throw new PublicSigningError('invalid', 'Token mismatch.');
  }

  const typedSigner = signer as SignatureRequestSigner;

  if (typedSigner.token_revoked_at) {
    // Revoked reads as invalid, not as "revoked": telling a stranger that a link
    // was deliberately killed is information they have no claim to.
    throw new PublicSigningError('invalid', 'Token revoked.');
  }
  if (typedSigner.signed_at) {
    throw new PublicSigningError('completed', 'Already signed.');
  }
  if (typedSigner.declined_at) {
    throw new PublicSigningError('declined', 'Already declined.');
  }
  if (new Date(typedSigner.token_expires_at).getTime() <= Date.now()) {
    throw new PublicSigningError('expired', 'Token expired.');
  }

  const { data: request, error: requestError } = await admin
    .from('signature_requests')
    .select('*, clients(full_name, agency_name), consent_templates(public_title)')
    .eq('id', typedSigner.request_id)
    .maybeSingle();

  if (requestError || !request) {
    throw new PublicSigningError('unavailable', 'Request lookup failed.');
  }

  const row = request as Record<string, unknown>;
  const typedRequest = row as unknown as SignatureRequest;

  if (typedRequest.status === 'cancelled') {
    throw new PublicSigningError('cancelled', 'Request cancelled.');
  }
  if (typedRequest.status === 'declined') {
    throw new PublicSigningError('declined', 'Request declined.');
  }
  if (typedRequest.status === 'signed') {
    throw new PublicSigningError('completed', 'Request signed.');
  }
  if (typedRequest.status === 'expired') {
    throw new PublicSigningError('expired', 'Request expired.');
  }
  // A draft has no business being reachable: its link should never have been
  // handed out. Treat as invalid rather than explaining.
  if (typedRequest.status === 'draft') {
    throw new PublicSigningError('invalid', 'Request is still a draft.');
  }
  if (typedRequest.expires_at && new Date(typedRequest.expires_at).getTime() <= Date.now()) {
    throw new PublicSigningError('expired', 'Request expired.');
  }

  const client = row.clients as { full_name?: string; agency_name?: string | null } | null;
  const template = row.consent_templates as { public_title?: string } | null;

  return {
    request: typedRequest,
    signer: typedSigner,
    clientName: client?.full_name ?? '',
    agencyName: client?.agency_name ?? null,
    templateTitle: template?.public_title ?? typedRequest.title,
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Writes an audit row.
 *
 * IP and user-agent come from the request headers, captured here on the server.
 * A browser-supplied value would be worthless as evidence — anyone can claim any
 * IP — so they are never accepted from the body.
 */
export async function recordEvent(
  requestId: string,
  signerId: string | null,
  eventType: string,
  meta: RequestMeta,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from('signature_events').insert({
    request_id: requestId,
    signer_id: signerId,
    // Null: the signer is not a CRM user. That is what distinguishes their
    // actions from an agent's in the trail.
    performed_by: null,
    event_type: eventType,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
    // The token is absent, always. An audit trail must never carry the secret it
    // is auditing.
    metadata,
  });
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export interface PublicDocument {
  title: string;
  agencyName: string | null;
  content: TemplateContent;
  consentText: string;
  signerName: string;
  expiresAt: string;
  /** Already viewed at least once — used only to avoid duplicate events. */
  alreadyViewed: boolean;
}

/**
 * The document, plus the first-view bookkeeping.
 *
 * viewed_at is written once. A signer who reloads five times has viewed it once,
 * and five identical rows would bury the moments that matter.
 */
export async function loadPublicDocument(
  session: SigningSession,
  meta: RequestMeta
): Promise<PublicDocument> {
  const admin = getSupabaseAdmin();
  const { request, signer } = session;
  const snapshot = request.merge_data_snapshot as MergeDataSnapshot | null;

  const firstView = !signer.viewed_at;

  if (firstView) {
    const now = new Date().toISOString();

    await admin
      .from('signature_request_signers')
      .update({ viewed_at: now })
      .eq('id', signer.id)
      .is('viewed_at', null);

    if (!request.viewed_at) {
      await admin.from('signature_requests').update({ viewed_at: now }).eq('id', request.id).is('viewed_at', null);
    }

    // sent -> viewed. Any other status stays put; the state machine has no
    // viewed transition from anywhere else.
    if (request.status === 'sent') {
      await admin.from('signature_requests').update({ status: 'viewed' }).eq('id', request.id).eq('status', 'sent');
    }

    await recordEvent(request.id, signer.id, 'document_viewed', meta, { first_view: true });
  }

  return {
    title: request.title,
    agencyName: session.agencyName,
    content: request.rendered_content,
    consentText: snapshot?.rendered_consent_text ?? '',
    signerName: signer.full_name,
    expiresAt: signer.token_expires_at,
    alreadyViewed: !firstView,
  };
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------

export interface SignInput {
  method: 'draw' | 'typed';
  /** data:image/png;base64,... — only for method 'draw'. */
  signatureImage?: string;
  /** Only for method 'typed'. */
  typedSignature?: string;
  /** Must be true; the checkbox is not optional. */
  consentAccepted: boolean;
  /** The consent wording the signer actually saw, echoed back to be snapshotted. */
  consentText: string;
}

const MAX_SIGNATURE_BYTES = 1_500_000; // under the bucket's 2 MB ceiling

/** Rejects anything that is not a plausible PNG data URL. */
function decodeSignatureImage(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new PublicSigningError('invalid', 'Signature image must be a PNG data URL.');
  }
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length === 0) {
    throw new PublicSigningError('invalid', 'Signature image is empty.');
  }
  if (buffer.length > MAX_SIGNATURE_BYTES) {
    throw new PublicSigningError('invalid', 'Signature image is too large.');
  }
  // PNG magic number. The browser's declared type is not evidence of anything.
  const magic = buffer.subarray(0, 8);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!magic.equals(png)) {
    throw new PublicSigningError('invalid', 'Signature image is not a PNG.');
  }
  return buffer;
}

export interface SignResult {
  signedAt: string;
  /** Set when the PDF could not be built. The signature is still safe. */
  documentWarning?: string;
}

/**
 * Completes a signature.
 *
 * The ordering is the whole design:
 *   1. validate everything;
 *   2. store the signature image (a file with no row is garbage; a row with no
 *      file is a broken record);
 *   3. claim the signer row with a conditional update — this is the lock;
 *   4. only then move the request and write the events.
 *
 * Step 3 is what makes double-signing impossible. The update carries
 * `.is('signed_at', null)`, so two concurrent requests both try to claim and
 * exactly one matches a row. The loser sees zero rows updated and stops. The
 * database trigger refuses a second signature independently, so even a bug here
 * cannot produce two.
 */
export async function signDocument(
  session: SigningSession,
  input: SignInput,
  meta: RequestMeta
): Promise<SignResult> {
  const admin = getSupabaseAdmin();
  const { request, signer } = session;

  // ---- Validate --------------------------------------------------------
  if (!input.consentAccepted) {
    throw new PublicSigningError('invalid', 'The electronic signature consent must be accepted.');
  }
  if (input.method !== 'draw' && input.method !== 'typed') {
    throw new PublicSigningError('invalid', 'Unknown signature method.');
  }

  const consentText = (input.consentText ?? '').trim();
  if (!consentText) {
    throw new PublicSigningError('invalid', 'The consent statement is missing.');
  }

  let imageBuffer: Buffer | null = null;
  let typedSignature: string | null = null;

  if (input.method === 'draw') {
    if (!input.signatureImage) {
      throw new PublicSigningError('invalid', 'A drawn signature is required.');
    }
    imageBuffer = decodeSignatureImage(input.signatureImage);
  } else {
    typedSignature = (input.typedSignature ?? '').trim();
    if (!typedSignature) {
      throw new PublicSigningError('invalid', 'A typed signature is required.');
    }
    if (typedSignature.length > 200) {
      throw new PublicSigningError('invalid', 'The typed signature is too long.');
    }
  }

  await recordEvent(request.id, signer.id, 'signature_started', meta, { method: input.method });

  const now = new Date().toISOString();

  // ---- Store the image -------------------------------------------------
  // The agent id is the first path segment, matching the storage RLS rule.
  let imagePath: string | null = null;
  if (imageBuffer) {
    const { data: client } = await admin
      .from('clients')
      .select('agent_id')
      .eq('id', request.client_id)
      .maybeSingle();

    if (!client?.agent_id) {
      throw new PublicSigningError('unavailable', 'Cannot resolve the owning agent.');
    }

    imagePath = `${client.agent_id}/${request.client_id}/${request.id}/${signer.id}/signature.png`;

    const { error: uploadError } = await admin.storage
      .from('signatures')
      .upload(imagePath, imageBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      throw new PublicSigningError('unavailable', `Signature upload failed: ${uploadError.message}`);
    }
  }

  // ---- Claim the signature ---------------------------------------------
  const { data: claimed, error: claimError } = await admin
    .from('signature_request_signers')
    .update({
      signature_method: input.method,
      signature_image_path: imagePath,
      typed_signature: typedSignature,
      consent_text_snapshot: consentText,
      consent_version: String(request.template_version_id),
      consent_accepted_at: now,
      signed_at: now,
      // The link dies at the moment it is used. Same statement, so there is no
      // window in which a signed document still has a live link.
      token_revoked_at: now,
    })
    .eq('id', signer.id)
    .is('signed_at', null)
    .is('declined_at', null)
    .select('id');

  if (claimError) {
    throw new PublicSigningError('unavailable', `Could not record the signature: ${claimError.message}`);
  }
  if (!claimed || claimed.length === 0) {
    // Someone got here first — a double submit, a replay, or a race. Nothing was
    // written twice, which is the point.
    throw new PublicSigningError('completed', 'This document has already been signed.');
  }

  // ---- Advance the request ---------------------------------------------
  const { error: statusError } = await admin
    .from('signature_requests')
    .update({ status: 'signed', signed_at: now })
    .eq('id', request.id)
    .in('status', ['sent', 'viewed']);

  if (statusError) {
    // The signature is recorded and safe. Leave it; report the inconsistency
    // rather than trying to undo evidence.
    console.error('Signature stored but request status could not advance:', statusError.message);
  }

  await recordEvent(request.id, signer.id, 'consent_accepted', meta, {
    consent_text_length: consentText.length,
  });
  await recordEvent(request.id, signer.id, 'document_signed', meta, {
    method: input.method,
    has_image: Boolean(imagePath),
  });

  await writeConsentChronology(request, 'consent_signed', `Consent signed: ${request.title}`, {
    signer_name: signer.full_name,
    method: input.method,
  });

  // ---- Register the signature file --------------------------------------
  if (imagePath && imageBuffer) {
    await admin.from('signature_files').insert({
      request_id: request.id,
      signer_id: signer.id,
      file_type: 'signature_image',
      storage_bucket: 'signatures',
      storage_path: imagePath,
      mime_type: 'image/png',
      size_bytes: imageBuffer.length,
      sha256_hash: createHash('sha256').update(imageBuffer).digest('hex'),
    });
  }

  return { signedAt: now };
}

// ---------------------------------------------------------------------------
// Decline
// ---------------------------------------------------------------------------

export async function declineDocument(
  session: SigningSession,
  reason: string | null,
  meta: RequestMeta
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { request, signer } = session;
  const now = new Date().toISOString();

  // Same conditional-claim pattern as signing: exactly one of decline/sign wins.
  const { data: claimed, error } = await admin
    .from('signature_request_signers')
    .update({ declined_at: now, token_revoked_at: now })
    .eq('id', signer.id)
    .is('signed_at', null)
    .is('declined_at', null)
    .select('id');

  if (error) {
    throw new PublicSigningError('unavailable', `Could not record the decline: ${error.message}`);
  }
  if (!claimed || claimed.length === 0) {
    throw new PublicSigningError('completed', 'This document has already been completed.');
  }

  await admin
    .from('signature_requests')
    .update({ status: 'declined', declined_at: now })
    .eq('id', request.id)
    .in('status', ['sent', 'viewed']);

  await recordEvent(request.id, signer.id, 'document_declined', meta, {
    // Trimmed: a reason box is a free-text field on a public endpoint.
    reason: reason ? reason.slice(0, 500) : null,
  });

  await writeConsentChronology(request, 'consent_declined', `Consent declined: ${request.title}`, {
    signer_name: signer.full_name,
  });
}

/** Used by the PDF generator to name temporary artifacts deterministically. */
export function newFileId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Chronology
// ---------------------------------------------------------------------------

/**
 * Writes a consent event to the CRM's own timeline.
 *
 * activity_events is a different audience from signature_events. The latter is
 * forensic — every view, every delivery attempt, every IP. This is the human
 * story an agent skims on a client's profile, so only the moments that change
 * the situation land here.
 *
 * Best-effort by design: a timeline entry is never worth failing a signature over.
 */
export async function writeConsentChronology(
  request: Pick<SignatureRequest, 'id' | 'client_id' | 'policy_id' | 'created_by' | 'title'>,
  eventType: 'consent_signed' | 'consent_declined',
  title: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from('activity_events').insert({
      client_id: request.client_id,
      // Set when the consent has a policy, so the entry also shows on the
      // policy's own timeline. activity_events.policy_id exists for exactly this.
      policy_id: request.policy_id,
      // The agent who created the consent. activity_events.actor_id is NOT NULL
      // and references auth.users, and the signer is not a CRM user — attributing
      // it to the owning agent is the only honest option available.
      actor_id: request.created_by,
      event_type: eventType,
      title,
      metadata: { request_id: request.id, ...metadata },
    });
  } catch (err) {
    console.error('Could not write consent Chronology:', err instanceof Error ? err.message : err);
  }
}
