/**
 * Consents & Signatures — signature request data access.
 *
 * Creating a draft touches four tables in sequence. supabase-js cannot open a
 * transaction from the browser, so this file compensates with an explicit
 * ordering and a cleanup path: the request is created first and is the only
 * thing that has to be undone if a later step fails. Because a draft is never
 * evidence, deleting it is safe — the RLS DELETE policy and the
 * signature_requests_guard_delete_trg trigger both allow it precisely while
 * status is 'draft', and both refuse the moment it stops being one.
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  ClientConsentRow,
  ConsentTemplate,
  ConsentTemplateVersion,
  MergeDataSnapshot,
  SignatureRequest,
  TemplateContent,
} from './types';
import { describeSupabaseError } from './template-service';
import { generateSecureToken } from './token-service';

class RequestServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestServiceError';
  }
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new RequestServiceError('Your session has expired. Sign in again.');
  }
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every consent for one client, newest first.
 *
 * The template and signer are pulled in the same round trip. PostgREST resolves
 * these through the real foreign keys declared in the migration, so a missing
 * relation would be a schema problem, not a data one.
 */
export async function listClientConsents(clientId: string): Promise<ClientConsentRow[]> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select(
      '*, consent_templates(internal_name, public_title), signature_request_signers(full_name, email, signer_order)'
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new RequestServiceError(describeSupabaseError(error));

  return (data ?? []).map((row: Record<string, unknown>) => {
    const template = row.consent_templates as
      | { internal_name?: string; public_title?: string }
      | null;
    const signers = (row.signature_request_signers ?? []) as Array<{
      full_name?: string;
      email?: string | null;
      signer_order?: number;
    }>;
    // V1 has exactly one signer, but the schema allows several — take the first
    // in order rather than assuming index 0 is the first.
    const primary = [...signers].sort((a, b) => (a.signer_order ?? 1) - (b.signer_order ?? 1))[0];

    return {
      ...(row as unknown as SignatureRequest),
      template_internal_name: template?.internal_name ?? null,
      template_public_title: template?.public_title ?? null,
      signer_name: primary?.full_name ?? null,
      signer_email: primary?.email ?? null,
    };
  });
}

export async function getConsent(requestId: string): Promise<SignatureRequest> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  if (!data) throw new RequestServiceError('Consent not found, or you do not have access to it.');
  return data as SignatureRequest;
}

/** Active templates only — an inactive or archived template must not be sendable. */
export async function listActiveTemplates(): Promise<ConsentTemplate[]> {
  const { data, error } = await supabase
    .from('consent_templates')
    .select('*')
    .eq('status', 'active')
    .order('internal_name', { ascending: true });

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  return (data ?? []) as ConsentTemplate[];
}

/** The policies belonging to one client, for the optional policy step. */
export async function listClientPolicies(clientId: string) {
  const { data, error } = await supabase
    .from('policies')
    .select('id, policy_number, policy_type, policy_subtype, company_name, status, effective_date, expiration_date')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  return data ?? [];
}

// ---------------------------------------------------------------------------
// usage_count
// ---------------------------------------------------------------------------

/**
 * Recounts usage_count from signature_requests rather than incrementing it.
 *
 * A read-modify-write "+1" loses updates when two drafts are created at once. A
 * recount is idempotent and self-correcting: whatever raced, both callers end up
 * writing the same true number, and any historical drift is repaired on the next
 * write. An atomic RPC would be nicer still, but that is database infrastructure
 * this phase is not authorised to add.
 *
 * Failure here is deliberately not fatal — see createConsentDraft.
 */
export async function refreshTemplateUsageCount(templateId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId);

  if (countError) throw new RequestServiceError(describeSupabaseError(countError));

  const { error: updateError } = await supabase
    .from('consent_templates')
    .update({ usage_count: count ?? 0 })
    .eq('id', templateId);

  if (updateError) throw new RequestServiceError(describeSupabaseError(updateError));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateDraftInput {
  clientId: string;
  policyId: string | null;
  template: ConsentTemplate;
  version: ConsentTemplateVersion;
  title: string;
  renderedContent: TemplateContent;
  renderedConsentText: string;
  mergeSnapshot: MergeDataSnapshot;
  originalDocumentHash: string;
  signer: {
    fullName: string;
    email: string | null;
    phone: string | null;
  };
  expiresAt: Date;
}

export interface CreateDraftResult {
  requestId: string;
  signerId: string;
  /**
   * The raw token, returned once and never persisted. Phase 7 will build the
   * /sign/<token> link from it. It is not stored anywhere, so if it is discarded
   * the link can never be reconstructed — only reissued.
   */
  token: string;
  /** Set when the draft is valid but usage_count could not be refreshed. */
  warning?: string;
}

/**
 * Creates a draft consent: request + signer + audit event.
 *
 * Order matters. The request goes first because it is the only row the others
 * depend on, and the only one we can safely remove on failure. If any later step
 * fails, the request is deleted and its children go with it via ON DELETE
 * CASCADE — leaving nothing half-built for the agent to trip over.
 */
export async function createConsentDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const userId = await requireUserId();

  // ---- Guard rails before we write anything ------------------------------
  if (input.template.status !== 'active') {
    throw new RequestServiceError(
      `Template "${input.template.internal_name}" is ${input.template.status} and cannot be used for a new consent.`
    );
  }
  if (input.version.template_id !== input.template.id) {
    throw new RequestServiceError('Internal error: the version does not belong to the selected template.');
  }
  if (!input.signer.fullName.trim()) {
    throw new RequestServiceError('The signer needs a full name.');
  }
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new RequestServiceError('The expiration date must be in the future.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.originalDocumentHash)) {
    throw new RequestServiceError('Internal error: the document hash is malformed.');
  }

  // The token is minted before the insert so a failure to generate it never
  // leaves a signer row without a working link.
  const token = await generateSecureToken();

  // ---- 1. The request ----------------------------------------------------
  const { data: request, error: requestError } = await supabase
    .from('signature_requests')
    .insert({
      client_id: input.clientId,
      policy_id: input.policyId,
      template_id: input.template.id,
      template_version_id: input.version.id,
      created_by: userId,
      title: input.title.trim(),
      rendered_content: input.renderedContent,
      merge_data_snapshot: input.mergeSnapshot,
      status: 'draft',
      original_document_hash: input.originalDocumentHash,
      expires_at: input.expiresAt.toISOString(),
      final_document_status: 'not_started',
    })
    .select('id')
    .single();

  if (requestError || !request) {
    throw new RequestServiceError(describeSupabaseError(requestError));
  }

  const requestId = request.id as string;

  // From here on, any failure must leave nothing behind.
  const rollback = async () => {
    // Safe only because status is still 'draft'. The delete trigger enforces
    // that rule independently of this code.
    await supabase.from('signature_requests').delete().eq('id', requestId);
  };

  // ---- 2. The signer -----------------------------------------------------
  const { data: signer, error: signerError } = await supabase
    .from('signature_request_signers')
    .insert({
      request_id: requestId,
      signer_order: 1,
      full_name: input.signer.fullName.trim(),
      email: input.signer.email?.trim() || null,
      phone: input.signer.phone?.trim() || null,
      token_hash: token.hash,
      token_expires_at: input.expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (signerError || !signer) {
    await rollback();
    throw new RequestServiceError(describeSupabaseError(signerError));
  }

  // ---- 3. The audit event ------------------------------------------------
  const { error: eventError } = await supabase.from('signature_events').insert({
    request_id: requestId,
    signer_id: signer.id,
    performed_by: userId,
    event_type: 'request_created',
    metadata: {
      template_id: input.template.id,
      template_version: input.version.version_number,
      policy_attached: input.policyId !== null,
      unresolved_variables: input.mergeSnapshot.unresolved,
      // The token is absent on purpose. An audit trail must never carry the
      // secret it is auditing.
    },
  });

  if (eventError) {
    // A consent whose creation was never recorded is not one we should keep:
    // the audit trail has to be complete from the first moment or it is not an
    // audit trail.
    await rollback();
    throw new RequestServiceError(describeSupabaseError(eventError));
  }

  // ---- 4. usage_count ----------------------------------------------------
  // Non-fatal. The draft is real and correct at this point; a stale counter is a
  // cosmetic problem, and destroying valid work over it would be worse. The next
  // successful create repairs it, because it recounts rather than increments.
  let warning: string | undefined;
  try {
    await refreshTemplateUsageCount(input.template.id);
  } catch (err) {
    warning = `The consent was saved, but the template's usage counter could not be updated (${
      err instanceof Error ? err.message : 'unknown error'
    }). This does not affect the document.`;
  }

  return { requestId, signerId: signer.id as string, token: token.raw, warning };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes a draft. Anything past draft is evidence and must be cancelled instead.
 *
 * The status check here is a courtesy that produces a readable message; the real
 * guarantee is signature_requests_guard_delete_trg, which raises for any
 * non-draft row even if this check were bypassed or raced.
 */
export async function deleteConsentDraft(requestId: string): Promise<void> {
  const existing = await getConsent(requestId);

  if (existing.status !== 'draft') {
    throw new RequestServiceError(
      `This consent has status "${existing.status}" and cannot be deleted. Only drafts can be removed.`
    );
  }

  const { error } = await supabase.from('signature_requests').delete().eq('id', requestId);
  if (error) throw new RequestServiceError(describeSupabaseError(error));

  // Recount so the template's usage figure follows the deletion. Non-fatal for
  // the same reason as on create.
  try {
    await refreshTemplateUsageCount(existing.template_id);
  } catch {
    // Swallowed deliberately: the draft is gone, which is what was asked. The
    // counter self-heals on the next write.
  }
}

export { RequestServiceError };
