/**
 * Consents & Signatures — template data access.
 *
 * All calls go through the existing authenticated browser client and are governed
 * by RLS (consent_templates.agent_id = auth.uid()). No service role, no API
 * routes: an agent can only ever see and touch their own templates, and that is
 * enforced by Postgres, not by this file.
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  ConsentTemplate,
  ConsentTemplateVersion,
  SaveOutcome,
  TemplateDraft,
  TemplateStatus,
} from './types';
import { computeContentHash, extractVariables, extractVariablesFromText, normalizeContent, normalizeText } from './template-blocks';
import { validateTemplateDraft, validateVariablesMatch } from './validation';

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Turns a Supabase error into something an insurance agent can act on, while
 * keeping the raw message available for debugging.
 *
 * The mappings below are for constraints and triggers we deliberately created in
 * migration_electronic_signatures.sql. Anything unmapped is surfaced verbatim
 * rather than swallowed — a silent failure on a consent document is worse than
 * an ugly message.
 */
export function describeSupabaseError(error: { message?: string; code?: string; details?: string } | null): string {
  if (!error) return 'Unknown error.';
  const raw = error.message || error.details || 'Unknown error.';

  // Our own trigger messages are already written for humans.
  if (raw.includes('is frozen')) {
    return 'This version has already been used by a signature request and can no longer be edited. Publish a new version instead.';
  }
  if (raw.includes('consent_templates_language_check')) {
    return 'Language must be English or Spanish.';
  }
  if (raw.includes('consent_templates_status_check')) {
    return 'That status is not allowed.';
  }
  if (raw.includes('consent_templates_archived_at_check')) {
    return 'An archived template must record when it was archived.';
  }
  if (raw.includes('consent_template_versions_unique_version')) {
    return 'That version number already exists for this template. Reload the page and try again.';
  }
  if (raw.includes('consent_template_versions_content_hash_check')) {
    return 'The computed content hash is malformed. This is a bug — please report it.';
  }
  if (raw.includes('consent_template_versions_consent_text_check')) {
    return 'The consent statement cannot be empty.';
  }

  // Postgres-level classes.
  if (error.code === '42501' || raw.includes('row-level security')) {
    return 'You do not have access to this template.';
  }
  if (error.code === '23503') {
    return 'This template is referenced by other records and cannot be changed that way.';
  }
  if (error.code === '42P01' || raw.includes('does not exist')) {
    return 'The consent tables are not present in this database yet. Run migration_electronic_signatures.sql first.';
  }

  return raw;
}

class TemplateServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateServiceError';
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new TemplateServiceError('Your session has expired. Sign in again.');
  }
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface TemplateFilters {
  search?: string;
  status?: TemplateStatus | '';
  language?: string;
}

export async function listTemplates(filters: TemplateFilters = {}): Promise<ConsentTemplate[]> {
  let query = supabase
    .from('consent_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.language) {
    query = query.eq('language', filters.language);
  }
  if (filters.search?.trim()) {
    // Escape the PostgREST `or` delimiters so a name with a comma or paren
    // cannot break out of the filter expression.
    const term = filters.search.trim().replace(/[,()]/g, ' ');
    query = query.or(`internal_name.ilike.%${term}%,public_title.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new TemplateServiceError(describeSupabaseError(error));
  return (data ?? []) as ConsentTemplate[];
}

export async function getTemplate(templateId: string): Promise<ConsentTemplate> {
  const { data, error } = await supabase
    .from('consent_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw new TemplateServiceError(describeSupabaseError(error));
  // RLS makes another agent's template indistinguishable from a missing one, and
  // that is intentional — we must not confirm it exists.
  if (!data) throw new TemplateServiceError('Template not found, or you do not have access to it.');
  return data as ConsentTemplate;
}

export async function listVersions(templateId: string): Promise<ConsentTemplateVersion[]> {
  const { data, error } = await supabase
    .from('consent_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false });

  if (error) throw new TemplateServiceError(describeSupabaseError(error));
  return (data ?? []) as ConsentTemplateVersion[];
}

export async function getVersion(
  templateId: string,
  versionNumber: number
): Promise<ConsentTemplateVersion | null> {
  const { data, error } = await supabase
    .from('consent_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('version_number', versionNumber)
    .maybeSingle();

  if (error) throw new TemplateServiceError(describeSupabaseError(error));
  return (data as ConsentTemplateVersion) ?? null;
}

/** The version current_version points at. */
export async function getCurrentVersion(
  template: ConsentTemplate
): Promise<ConsentTemplateVersion | null> {
  return getVersion(template.id, template.current_version);
}

/**
 * Whether a template's current version is already referenced by a signature
 * request. Drives the Save Draft vs Publish decision.
 *
 * Phase 3 has no signature_requests UI, but the table exists and the trigger
 * will fire, so the check is real rather than hypothetical. usage_count is not
 * used here: it is maintained by the service layer and could drift, whereas this
 * asks the source of truth.
 */
export async function isVersionUsed(versionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('template_version_id', versionId);

  if (error) throw new TemplateServiceError(describeSupabaseError(error));
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

interface DerivedPayload {
  content: TemplateDraft['content'];
  consent_text: string;
  variables_used: string[];
  content_hash: string;
}

/**
 * Normalizes, validates, then derives variables_used and content_hash.
 *
 * Nothing here trusts the form: the hash is always recomputed and the variable
 * list is always re-extracted, so a stale value in component state can never be
 * written as if it were authoritative.
 */
async function derivePayload(draft: TemplateDraft): Promise<DerivedPayload> {
  const content = normalizeContent(draft.content);
  const consent_text = normalizeText(draft.consent_text);

  const normalized: TemplateDraft = { ...draft, content, consent_text };
  const { valid, issues } = validateTemplateDraft(normalized);
  if (!valid) {
    throw new TemplateServiceError(issues.map((i) => i.message).join(' '));
  }

  const variables_used = Array.from(
    new Set([...extractVariables(content), ...extractVariablesFromText(consent_text)])
  ).sort();

  const mismatch = validateVariablesMatch(content, consent_text, variables_used);
  if (mismatch.length > 0) {
    throw new TemplateServiceError(mismatch.map((i) => i.message).join(' '));
  }

  const content_hash = await computeContentHash(content, consent_text, variables_used);

  return { content, consent_text, variables_used, content_hash };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creates the template plus version 1.
 *
 * There is no transaction: supabase-js cannot open one from the browser. If the
 * version insert fails we delete the just-created template so a headless row is
 * not left behind. That cleanup is possible precisely because the RLS DELETE
 * policy allows removing an unused draft — which is why it is safe here and
 * would not be for anything already published.
 */
export async function createTemplate(draft: TemplateDraft): Promise<SaveOutcome> {
  const userId = await requireUserId();
  const payload = await derivePayload(draft);

  const { data: template, error: templateError } = await supabase
    .from('consent_templates')
    .insert({
      agent_id: userId,
      created_by: userId,
      internal_name: normalizeText(draft.internal_name),
      public_title: normalizeText(draft.public_title),
      description: normalizeText(draft.description) || null,
      language: draft.language,
      status: 'draft',
      current_version: 1,
    })
    .select('id')
    .single();

  if (templateError || !template) {
    throw new TemplateServiceError(describeSupabaseError(templateError));
  }

  const { error: versionError } = await supabase.from('consent_template_versions').insert({
    template_id: template.id,
    version_number: 1,
    content: payload.content,
    consent_text: payload.consent_text,
    variables_used: payload.variables_used,
    content_hash: payload.content_hash,
    created_by: userId,
  });

  if (versionError) {
    await supabase.from('consent_templates').delete().eq('id', template.id);
    throw new TemplateServiceError(describeSupabaseError(versionError));
  }

  return { kind: 'created', templateId: template.id, version: 1 };
}

/** Metadata only — never touches content, and never touches usage_count. */
export async function updateTemplateMeta(
  templateId: string,
  meta: Pick<TemplateDraft, 'internal_name' | 'public_title' | 'description' | 'language'>
): Promise<void> {
  const { error } = await supabase
    .from('consent_templates')
    .update({
      internal_name: normalizeText(meta.internal_name),
      public_title: normalizeText(meta.public_title),
      description: normalizeText(meta.description) || null,
      language: meta.language,
    })
    .eq('id', templateId);

  if (error) throw new TemplateServiceError(describeSupabaseError(error));
}

/**
 * Saves the body of a template, choosing between in-place update and a new
 * version based on whether the current version has actually been used.
 *
 * - unused version -> update it in place (Save Draft)
 * - used version   -> insert version N+1 and bump current_version (Publish)
 *
 * The trigger consent_template_versions_guard_frozen_trg is the real guarantee.
 * If someone creates a signature request between our check and our update, the
 * update raises and the caller sees the frozen-version message — the race
 * fails safe rather than overwriting evidence.
 */
export async function saveTemplateBody(
  template: ConsentTemplate,
  draft: TemplateDraft,
  options: { forceNewVersion?: boolean } = {}
): Promise<SaveOutcome> {
  const userId = await requireUserId();
  const payload = await derivePayload(draft);

  const current = await getCurrentVersion(template);
  if (!current) {
    throw new TemplateServiceError(
      `Version ${template.current_version} of this template is missing. The template may be corrupted.`
    );
  }

  const used = await isVersionUsed(current.id);
  const mustBranch = used || options.forceNewVersion === true;

  if (!mustBranch) {
    const { error } = await supabase
      .from('consent_template_versions')
      .update({
        content: payload.content,
        consent_text: payload.consent_text,
        variables_used: payload.variables_used,
        content_hash: payload.content_hash,
      })
      .eq('id', current.id);

    if (error) throw new TemplateServiceError(describeSupabaseError(error));
    return { kind: 'version_updated', templateId: template.id, version: current.version_number };
  }

  const nextVersion = template.current_version + 1;

  const { error: insertError } = await supabase.from('consent_template_versions').insert({
    template_id: template.id,
    version_number: nextVersion,
    content: payload.content,
    consent_text: payload.consent_text,
    variables_used: payload.variables_used,
    content_hash: payload.content_hash,
    created_by: userId,
  });

  if (insertError) throw new TemplateServiceError(describeSupabaseError(insertError));

  const { error: bumpError } = await supabase
    .from('consent_templates')
    .update({ current_version: nextVersion })
    .eq('id', template.id);

  if (bumpError) {
    // The new version exists but current_version still points at the old one.
    // Leave the row alone — deleting it would destroy a legitimate version — and
    // tell the user exactly what state they are in.
    throw new TemplateServiceError(
      `Version ${nextVersion} was saved but the template still points at version ${template.current_version}. Reload and publish again. (${describeSupabaseError(bumpError)})`
    );
  }

  return { kind: 'version_published', templateId: template.id, version: nextVersion };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export async function setTemplateStatus(
  templateId: string,
  status: TemplateStatus
): Promise<void> {
  // The archived_at CHECK requires a timestamp whenever status is 'archived'.
  const patch: Record<string, unknown> = { status };
  patch.archived_at = status === 'archived' ? new Date().toISOString() : null;

  const { error } = await supabase.from('consent_templates').update(patch).eq('id', templateId);
  if (error) throw new TemplateServiceError(describeSupabaseError(error));
}

export async function archiveTemplate(templateId: string): Promise<void> {
  return setTemplateStatus(templateId, 'archived');
}

/**
 * Copies a template and its current version into a brand new draft.
 *
 * The copy starts at version 1 with usage_count 0, because it is a different
 * document: inheriting the original's history would misrepresent what has been
 * signed.
 */
export async function duplicateTemplate(template: ConsentTemplate): Promise<string> {
  const source = await getCurrentVersion(template);
  if (!source) {
    throw new TemplateServiceError('Cannot duplicate: the current version of this template is missing.');
  }

  const outcome = await createTemplate({
    internal_name: `${template.internal_name} (copy)`,
    public_title: template.public_title,
    description: template.description ?? '',
    language: template.language,
    content: source.content,
    consent_text: source.consent_text,
  });

  return outcome.templateId;
}

export { TemplateServiceError };
