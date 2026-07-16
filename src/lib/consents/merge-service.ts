/**
 * Consents & Signatures — merge service.
 *
 * Turns a template version plus a real client (and optionally a real policy) into
 * a frozen document.
 *
 * Two rules govern everything here:
 *
 *   1. The template is never touched. renderTemplateContent returns a brand new
 *      TemplateContent; editing a template later cannot alter a document that was
 *      already rendered from it.
 *   2. An empty value is never rendered. "undefined", "null" and "" never reach a
 *      signer's eyes — an unresolved token stays visible as a token and is
 *      reported as a warning, so the agent decides what to do about it.
 *
 * Ownership is enforced by RLS, not by this file: reading a client or a policy
 * that belongs to another agent simply returns no row.
 */

import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import type {
  ClientMergeData,
  MergeDataSnapshot,
  MergeValues,
  PolicyMergeData,
  TemplateBlock,
  TemplateContent,
  UnresolvedVariable,
} from './types';
import { ALLOWED_VARIABLES, VARIABLE_GROUPS } from './types';
import { canonicalize, isListBlock, isTextBlock, sha256Hex } from './template-blocks';
import { describeSupabaseError } from './template-service';

class MergeServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeServiceError';
  }
}

/** Tokens that can only be filled when a policy is attached. */
const POLICY_TOKENS = new Set(
  VARIABLE_GROUPS.find((g) => g.key === 'policy')?.variables.map((v) => v.token) ?? []
);

const VARIABLE_LABELS: Record<string, string> = Object.fromEntries(
  VARIABLE_GROUPS.flatMap((g) => g.variables.map((v) => [v.token, `${g.label} · ${v.label}`]))
);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Client data assembled from the three real tables that hold it:
 *   clients                       -> full_name, email, phone
 *   client_personal_information   -> date_of_birth
 *   client_residence_information  -> address, city, zip_code, county
 *
 * The two sub-tables are optional by design (a client may exist without them),
 * so a missing row is not an error — it just means those tokens will not resolve.
 */
export async function getClientMergeData(clientId: string): Promise<ClientMergeData> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, agent_id, full_name, email, phone')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError) throw new MergeServiceError(describeSupabaseError(clientError));
  // RLS makes another agent's client indistinguishable from a missing one.
  if (!client) throw new MergeServiceError('Client not found, or you do not have access to it.');

  const [personalResult, residenceResult] = await Promise.all([
    supabase
      .from('client_personal_information')
      .select('date_of_birth')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('client_residence_information')
      .select('address, city, zip_code, county')
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);

  if (personalResult.error) throw new MergeServiceError(describeSupabaseError(personalResult.error));
  if (residenceResult.error) throw new MergeServiceError(describeSupabaseError(residenceResult.error));

  return {
    client_id: client.id,
    agent_id: client.agent_id,
    full_name: client.full_name ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    date_of_birth: personalResult.data?.date_of_birth ?? null,
    address: residenceResult.data?.address ?? null,
    city: residenceResult.data?.city ?? null,
    zip_code: residenceResult.data?.zip_code ?? null,
    county: residenceResult.data?.county ?? null,
  };
}

/**
 * Policy data, verified to belong to the given client.
 *
 * The client_id filter is not decoration: without it, an agent could attach one
 * of their own policies belonging to a different client. RLS would allow the
 * read (same agent), so this check has to happen here. The database enforces the
 * same rule again via signature_requests_validate_relations_trg — this exists so
 * the user gets a sentence instead of a trigger exception.
 */
export async function getPolicyMergeData(
  policyId: string,
  clientId: string
): Promise<PolicyMergeData> {
  const { data, error } = await supabase
    .from('policies')
    .select(
      'id, client_id, policy_number, policy_type, policy_subtype, company_name, effective_date, expiration_date, premium, total_premium'
    )
    .eq('id', policyId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) throw new MergeServiceError(describeSupabaseError(error));
  if (!data) {
    throw new MergeServiceError('That policy does not belong to this client, or you do not have access to it.');
  }

  // full_premium = COALESCE(total_premium, premium). annual_premium is never used.
  // Note 0 is a real premium, so the fallback tests for null/undefined only.
  const fullPremium =
    data.total_premium !== null && data.total_premium !== undefined
      ? Number(data.total_premium)
      : data.premium !== null && data.premium !== undefined
        ? Number(data.premium)
        : null;

  return {
    policy_id: data.id,
    client_id: data.client_id,
    policy_number: data.policy_number ?? null,
    policy_type: data.policy_type ?? null,
    policy_subtype: data.policy_subtype ?? null,
    company_name: data.company_name ?? null,
    effective_date: data.effective_date ?? null,
    expiration_date: data.expiration_date ?? null,
    full_premium: Number.isFinite(fullPremium as number) ? fullPremium : null,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Blank-ish values never become text. Returns undefined so the key is dropped. */
function text(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

/** MM/DD/YYYY, reusing the project's timezone-safe helper. */
function date(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const formatted = formatIsoToUsDate(value);
  // formatIsoToUsDate returns 'Not provided' for empty input — that is a UI
  // string, not a document value, so it must never end up merged into a consent.
  if (!formatted || formatted === 'Not provided') return undefined;
  return formatted;
}

/** USD, two decimals. 0 is a real amount and formats as $0.00. */
function money(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Assembles the token -> value map.
 *
 * A token is only present when it has a real value. Absent means unresolved, and
 * that is what drives the warnings. Nothing is invented: full_name is never
 * split, and there is no state or agency variable because no column holds them.
 *
 * `now` is injected so the same inputs always produce the same output — which is
 * what makes the hash reproducible in a test.
 */
export function buildMergeData(
  client: ClientMergeData,
  policy: PolicyMergeData | null,
  now: Date = new Date()
): MergeValues {
  const raw: Record<string, string | undefined> = {
    'client.full_name': text(client.full_name),
    'client.email': text(client.email),
    'client.phone': text(client.phone),
    'client.date_of_birth': date(client.date_of_birth),
    'client.address': text(client.address),
    'client.city': text(client.city),
    'client.zip_code': text(client.zip_code),
    'client.county': text(client.county),

    'policy.policy_number': policy ? text(policy.policy_number) : undefined,
    'policy.policy_type': policy ? text(policy.policy_type) : undefined,
    'policy.policy_subtype': policy ? text(policy.policy_subtype) : undefined,
    'policy.company_name': policy ? text(policy.company_name) : undefined,
    'policy.effective_date': policy ? date(policy.effective_date) : undefined,
    'policy.expiration_date': policy ? date(policy.expiration_date) : undefined,
    'policy.full_premium': policy ? money(policy.full_premium) : undefined,

    'current_date': date(now.toISOString().slice(0, 10)),
    'current_year': String(now.getFullYear()),
  };

  const values: MergeValues = {};
  for (const [token, value] of Object.entries(raw)) {
    if (value !== undefined) values[token] = value;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\}\}/g;

/**
 * Substitutes resolved tokens in a single string.
 *
 * A token with no value is left exactly as written. That is deliberate: leaving
 * "{{client.city}}" visible is honest and impossible to miss, whereas an empty
 * gap silently changes the meaning of a sentence the client is about to sign.
 * Unknown tokens are also left alone — they are literal text as far as we know.
 */
function substitute(input: string, values: MergeValues): string {
  return input.replace(TOKEN_PATTERN, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : value;
  });
}

/**
 * Produces the rendered document.
 *
 * Returns a new structure every time — the source content is treated as
 * immutable. This is the function that makes "editing a template later cannot
 * change a document already created" true in practice.
 */
export function renderTemplateContent(
  content: TemplateContent,
  values: MergeValues
): TemplateContent {
  const blocks: TemplateBlock[] = content.blocks.map((block) => {
    if (isTextBlock(block)) {
      return { ...block, text: substitute(block.text, values) };
    }
    if (isListBlock(block)) {
      return { ...block, items: block.items.map((item) => substitute(item, values)) };
    }
    // Structural and label blocks carry no variables; copy them so callers can
    // never mutate the template's own objects by reference.
    return { ...block };
  });

  return { blocks };
}

/** Same substitution for consent_text, which lives outside the block tree. */
export function renderConsentText(consentText: string, values: MergeValues): string {
  return substitute(consentText, values);
}

// ---------------------------------------------------------------------------
// Unresolved variables
// ---------------------------------------------------------------------------

/**
 * Which of the tokens this document uses could not be filled, and why.
 *
 * `variablesUsed` comes from the stored template version, so this reports on what
 * the document actually needs rather than on the full variable catalogue.
 */
export function findUnresolvedVariables(
  variablesUsed: string[],
  values: MergeValues,
  hasPolicy: boolean
): UnresolvedVariable[] {
  const unresolved: UnresolvedVariable[] = [];

  for (const token of variablesUsed) {
    if (values[token] !== undefined) continue;

    const label = VARIABLE_LABELS[token] ?? token;
    const isPolicyToken = POLICY_TOKENS.has(token);

    if (isPolicyToken && !hasPolicy) {
      unresolved.push({
        token,
        label,
        reason: 'This document uses a policy field, but no policy was selected.',
        needsPolicy: true,
      });
      continue;
    }

    if (!ALLOWED_VARIABLES.includes(token)) {
      unresolved.push({
        token,
        label,
        reason: 'This variable is not supported and will appear as literal text.',
        needsPolicy: false,
      });
      continue;
    }

    unresolved.push({
      token,
      label,
      reason: isPolicyToken
        ? 'The selected policy has no value recorded for this field.'
        : 'This client has no value recorded for this field.',
      needsPolicy: false,
    });
  }

  return unresolved;
}

// ---------------------------------------------------------------------------
// Snapshot + hash
// ---------------------------------------------------------------------------

/**
 * Freezes everything needed to explain, and to re-verify, this document later.
 *
 * renderedConsentText is stored here rather than in a column because
 * signature_requests has none for it, and original_document_hash covers it — a
 * hash over something we did not keep would be unverifiable, which is the same
 * as having no hash at all.
 */
export function buildMergeSnapshot(
  values: MergeValues,
  unresolved: UnresolvedVariable[],
  clientId: string,
  policyId: string | null,
  renderedConsentText: string,
  now: Date = new Date()
): MergeDataSnapshot {
  return {
    values,
    unresolved: unresolved.map((u) => u.token).sort(),
    rendered_consent_text: renderedConsentText,
    sources: { client_id: clientId, policy_id: policyId },
    captured_at: now.toISOString(),
    snapshot_version: 1,
  };
}

/**
 * Recomputes the hash of a stored request and compares it to what was recorded.
 *
 * This is the payoff for persisting rendered_consent_text: a signed document can
 * be proven unaltered without trusting the row it is stored in.
 */
export async function verifyStoredDocumentHash(
  renderedContent: TemplateContent,
  snapshot: MergeDataSnapshot,
  storedHash: string | null
): Promise<boolean> {
  if (!storedHash) return false;
  const recomputed = await createCanonicalContentHash(
    renderedContent,
    snapshot.rendered_consent_text ?? ''
  );
  return recomputed === storedHash;
}

/**
 * The SHA-256 that identifies exactly what the signer will see.
 *
 * It covers the rendered document and the rendered consent text — the two things
 * a person actually reads. It deliberately excludes the snapshot's captured_at,
 * because a timestamp would make the same document hash differently on every
 * render and destroy the hash's value as an identity.
 *
 * Canonical JSON (sorted keys) means structurally identical documents always
 * serialize byte-for-byte the same, so the hash is stable across sessions,
 * browsers and key ordering.
 */
export async function createCanonicalContentHash(
  renderedContent: TemplateContent,
  renderedConsentText: string
): Promise<string> {
  return sha256Hex(
    canonicalize({
      rendered_content: renderedContent,
      consent_text: renderedConsentText,
    })
  );
}

export { MergeServiceError };
