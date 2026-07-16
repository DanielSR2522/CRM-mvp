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
  DashboardConsentRow,
  DeliveryChannel,
  MergeDataSnapshot,
  RequestStatus,
  SignatureRequest,
  SignatureRequestSigner,
  TemplateContent,
} from './types';
import { describeSupabaseError } from './template-service';
import { generateSecureToken } from './token-service';
import { canTransition, explainTransition } from './status';

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

// ---------------------------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------------------------

export interface ConsentFilters {
  /** Matches the client's name. */
  clientSearch?: string;
  status?: RequestStatus | '';
  templateId?: string;
  channel?: DeliveryChannel | '';
  /** Inclusive, on created_at. */
  dateFrom?: string;
  dateTo?: string;
}

export interface ConsentPage {
  rows: DashboardConsentRow[];
  total: number;
}

/**
 * One page of consents across every client this agent owns.
 *
 * RLS does the scoping: signature_requests is readable only through
 * clients.agent_id = auth.uid(), so there is no agent filter here and there must
 * never be one — a filter can be forgotten, a policy cannot.
 */
export async function listConsents(
  filters: ConsentFilters = {},
  page = 1,
  pageSize = 25
): Promise<ConsentPage> {
  let query = supabase
    .from('signature_requests')
    .select(
      '*, clients!inner(full_name), consent_templates(internal_name), signature_request_signers(full_name, email, phone, signer_order)',
      { count: 'exact' }
    );

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.templateId) query = query.eq('template_id', filters.templateId);
  if (filters.channel) query = query.eq('selected_delivery_channel', filters.channel);
  if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
  // The whole end day is inclusive; a bare date would cut off everything after
  // midnight and quietly hide a day's work.
  if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);

  if (filters.clientSearch?.trim()) {
    // !inner above makes this filter the parent rows rather than just the join.
    const term = filters.clientSearch.trim().replace(/[,()]/g, ' ');
    query = query.ilike('clients.full_name', `%${term}%`);
  }

  const from = (page - 1) * pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new RequestServiceError(describeSupabaseError(error));

  return {
    rows: (data ?? []).map(toDashboardRow),
    total: count ?? 0,
  };
}

function toDashboardRow(row: Record<string, unknown>): DashboardConsentRow {
  const client = row.clients as { full_name?: string } | null;
  const template = row.consent_templates as { internal_name?: string } | null;
  const signers = (row.signature_request_signers ?? []) as Array<{
    full_name?: string;
    email?: string | null;
    phone?: string | null;
    signer_order?: number;
  }>;
  const primary = [...signers].sort((a, b) => (a.signer_order ?? 1) - (b.signer_order ?? 1))[0];

  return {
    ...(row as unknown as SignatureRequest),
    client_name: client?.full_name ?? null,
    template_internal_name: template?.internal_name ?? null,
    signer_name: primary?.full_name ?? null,
    signer_email: primary?.email ?? null,
    signer_phone: primary?.phone ?? null,
  };
}

/**
 * Counts per status for the summary cards.
 *
 * Every number is a real COUNT against the database rather than a tally of the
 * current page — a card that only counts what is on screen is a lie the moment
 * pagination kicks in. Uses head:true so no rows travel for a number.
 */
export async function countConsentsByStatus(
  filters: ConsentFilters = {}
): Promise<Record<RequestStatus, number>> {
  const statuses: RequestStatus[] = [
    'draft',
    'pending',
    'sent',
    'viewed',
    'signed',
    'declined',
    'expired',
  ];

  const counts = await Promise.all(
    statuses.map(async (status) => {
      let query = supabase
        .from('signature_requests')
        .select('id, clients!inner(full_name)', { count: 'exact', head: true })
        .eq('status', status);

      if (filters.templateId) query = query.eq('template_id', filters.templateId);
      if (filters.channel) query = query.eq('selected_delivery_channel', filters.channel);
      if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
      if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);
      if (filters.clientSearch?.trim()) {
        const term = filters.clientSearch.trim().replace(/[,()]/g, ' ');
        query = query.ilike('clients.full_name', `%${term}%`);
      }

      const { count, error } = await query;
      if (error) throw new RequestServiceError(describeSupabaseError(error));
      return [status, count ?? 0] as const;
    })
  );

  const result = {} as Record<RequestStatus, number>;
  for (const [status, count] of counts) result[status] = count;
  // Statuses without a card still need a key so callers can index safely.
  result.cancelled = 0;
  result.failed = 0;
  return result;
}

/** Templates that have ever been used, for the template filter. */
export async function listTemplatesForFilter(): Promise<Array<{ id: string; internal_name: string }>> {
  const { data, error } = await supabase
    .from('consent_templates')
    .select('id, internal_name')
    .order('internal_name', { ascending: true });

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  return (data ?? []) as Array<{ id: string; internal_name: string }>;
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
// Update a draft
// ---------------------------------------------------------------------------

/** The primary signer of a request. V1 always has exactly one. */
export async function getPrimarySigner(requestId: string): Promise<SignatureRequestSigner | null> {
  const { data, error } = await supabase
    .from('signature_request_signers')
    .select('*')
    .eq('request_id', requestId)
    .order('signer_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  return (data as SignatureRequestSigner) ?? null;
}

export interface UpdateDraftInput {
  requestId: string;
  title: string;
  signer: { fullName: string; email: string | null; phone: string | null };
  expiresAt: Date;
  /**
   * Present only when the agent chose to regenerate the document with fresh
   * data. Omitted when they chose to keep the original snapshot — in which case
   * nothing about the document is touched at all.
   */
  regenerated?: {
    policyId: string | null;
    renderedContent: TemplateContent;
    mergeSnapshot: MergeDataSnapshot;
    originalDocumentHash: string;
  };
}

/**
 * Edits a draft.
 *
 * The document and the metadata are updated separately on purpose. Renaming a
 * draft or fixing a typo in the signer's email must never silently re-merge the
 * document against data that has changed since — the agent decides that, and the
 * decision arrives here as the presence or absence of `regenerated`.
 *
 * Only drafts can be edited. Once sent, rendered_content is frozen by
 * signature_requests_guard_transitions_trg regardless of what this code does.
 */
export async function updateConsentDraft(input: UpdateDraftInput): Promise<void> {
  const existing = await getConsent(input.requestId);

  if (existing.status !== 'draft') {
    throw new RequestServiceError(
      `This consent has status "${existing.status}" and can no longer be edited. Only drafts can be changed.`
    );
  }
  if (!input.title.trim()) throw new RequestServiceError('A title is required.');
  if (!input.signer.fullName.trim()) throw new RequestServiceError('The signer needs a full name.');
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new RequestServiceError('The expiration date must be in the future.');
  }

  const patch: Record<string, unknown> = {
    title: input.title.trim(),
    expires_at: input.expiresAt.toISOString(),
  };

  if (input.regenerated) {
    if (!/^[a-f0-9]{64}$/.test(input.regenerated.originalDocumentHash)) {
      throw new RequestServiceError('Internal error: the document hash is malformed.');
    }
    patch.policy_id = input.regenerated.policyId;
    patch.rendered_content = input.regenerated.renderedContent;
    patch.merge_data_snapshot = input.regenerated.mergeSnapshot;
    patch.original_document_hash = input.regenerated.originalDocumentHash;
  }

  const { error: requestError } = await supabase
    .from('signature_requests')
    .update(patch)
    .eq('id', input.requestId);

  if (requestError) throw new RequestServiceError(describeSupabaseError(requestError));

  const signer = await getPrimarySigner(input.requestId);
  if (!signer) {
    throw new RequestServiceError('This draft has no signer. It cannot be repaired — delete it and start again.');
  }

  // token_hash is untouched here. Issuing a link is a separate, deliberate act.
  const { error: signerError } = await supabase
    .from('signature_request_signers')
    .update({
      full_name: input.signer.fullName.trim(),
      email: input.signer.email?.trim() || null,
      phone: input.signer.phone?.trim() || null,
      token_expires_at: input.expiresAt.toISOString(),
    })
    .eq('id', signer.id);

  if (signerError) throw new RequestServiceError(describeSupabaseError(signerError));

  const { data: userData } = await supabase.auth.getUser();
  await supabase.from('signature_events').insert({
    request_id: input.requestId,
    signer_id: signer.id,
    performed_by: userData?.user?.id ?? null,
    event_type: 'request_updated',
    metadata: {
      document_regenerated: Boolean(input.regenerated),
      unresolved_variables: input.regenerated?.mergeSnapshot.unresolved ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

/**
 * Moves a request to a new status, refusing illegal moves before the database
 * has to.
 *
 * signature_requests_guard_transitions_trg is the real authority — it makes
 * signed/declined/cancelled terminal even for the service role. This wrapper
 * exists so the agent gets a sentence and so the matching timestamp is always
 * written alongside the status, which the CHECK constraints require.
 */
export async function setConsentStatus(
  requestId: string,
  next: RequestStatus,
  options: { reason?: string } = {}
): Promise<void> {
  const existing = await getConsent(requestId);

  if (existing.status === next) return;

  if (!canTransition(existing.status, next)) {
    throw new RequestServiceError(
      explainTransition(existing.status, next) ?? `Cannot move this consent to "${next}".`
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next };

  // Each status implies its timestamp; the CHECK constraints reject the row
  // otherwise, so this is not optional bookkeeping.
  if (next === 'sent' && !existing.sent_at) patch.sent_at = now;
  if (next === 'viewed' && !existing.viewed_at) patch.viewed_at = now;
  if (next === 'declined') patch.declined_at = now;
  if (next === 'cancelled') patch.cancelled_at = now;

  const { error } = await supabase.from('signature_requests').update(patch).eq('id', requestId);
  if (error) throw new RequestServiceError(describeSupabaseError(error));

  const { data: userData } = await supabase.auth.getUser();
  const eventType =
    next === 'cancelled'
      ? 'request_cancelled'
      : next === 'expired'
        ? 'request_expired'
        : next === 'sent'
          ? 'request_sent'
          : 'request_updated';

  await supabase.from('signature_events').insert({
    request_id: requestId,
    performed_by: userData?.user?.id ?? null,
    event_type: eventType,
    metadata: { from: existing.status, to: next, reason: options.reason ?? null },
  });
}

/**
 * Cancels a consent.
 *
 * Cancelling is the only way to stop something that has already gone out —
 * deleting it is refused by the database, because a document a client has seen is
 * a fact and facts are not deleted.
 */
export async function cancelConsent(requestId: string, reason?: string): Promise<void> {
  return setConsentStatus(requestId, 'cancelled', { reason });
}

/** The full audit trail for one request, oldest first. */
export async function listConsentEvents(requestId: string) {
  const { data, error } = await supabase
    .from('signature_events')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error) throw new RequestServiceError(describeSupabaseError(error));
  return data ?? [];
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
