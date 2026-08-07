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
import { ALLOWED_VARIABLES } from './types';
import { TOKEN_LOOKUP } from './variable-registry';
import { canonicalize, isListBlock, isTextBlock, sha256Hex, normalizeVariableDelimiters } from './template-blocks';
import { describeSupabaseError } from './template-service';

class MergeServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeServiceError';
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Client & Agent data assembled from database tables:
 *   clients, client_personal_information, client_residence_information, profiles
 */
export async function getClientMergeData(clientId: string, overrideAgentId?: string): Promise<ClientMergeData> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, agent_id, full_name, email, phone, agency_name')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError) throw new MergeServiceError(describeSupabaseError(clientError));
  if (!client) throw new MergeServiceError('Client not found, or you do not have access to it.');

  const effectiveAgentId = client.agent_id || overrideAgentId;

  const [personalResult, residenceResult, agentResult] = await Promise.all([
    supabase
      .from('client_personal_information')
      .select('email, phone, date_of_birth, ssn, secondary_phone, secondary_email, gender, marital_status, immigration_status, tax_members')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('client_residence_information')
      .select('address, city, zip_code, county, state')
      .eq('client_id', clientId)
      .maybeSingle(),
    effectiveAgentId
      ? supabase
          .from('profiles')
          .select('name, first_name, last_name, email, phone, agency_name, npn_number, license_number, state, address, city, zip_code, website')
          .eq('id', effectiveAgentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (personalResult.error) throw new MergeServiceError(describeSupabaseError(personalResult.error));
  if (residenceResult.error) throw new MergeServiceError(describeSupabaseError(residenceResult.error));

  const agentData = agentResult?.data;

  // Process tax members array from personal info
  let sanitizedTaxMembers: any[] = [];
  if (Array.isArray(personalResult.data?.tax_members)) {
    sanitizedTaxMembers = personalResult.data.tax_members.map((m: any) => ({
      full_name: m.full_name || m.name || (m.first_name ? `${m.first_name} ${m.last_name || ''}`.trim() : null),
      date_of_birth: m.date_of_birth || m.dob || null,
      relationship: m.relationship || m.type || null,
    }));
  }

  const resolvedEmail = (personalResult.data?.email && personalResult.data.email.trim().length > 0)
    ? personalResult.data.email.trim()
    : (client.email ?? null);

  const resolvedPhone = (personalResult.data?.phone && personalResult.data.phone.trim().length > 0)
    ? personalResult.data.phone.trim()
    : (client.phone ?? null);

  return {
    client_id: client.id,
    agent_id: client.agent_id || overrideAgentId || null,
    full_name: client.full_name ?? null,
    email: resolvedEmail,
    phone: resolvedPhone,
    agency_name: client.agency_name ?? null,
    date_of_birth: personalResult.data?.date_of_birth ?? null,
    ssn: personalResult.data?.ssn ?? null,
    secondary_email: personalResult.data?.secondary_email ?? null,
    secondary_phone: personalResult.data?.secondary_phone ?? null,
    gender: personalResult.data?.gender ?? null,
    marital_status: personalResult.data?.marital_status ?? null,
    immigration_status: personalResult.data?.immigration_status ?? null,
    address: residenceResult.data?.address ?? null,
    city: residenceResult.data?.city ?? null,
    state: residenceResult.data?.state ?? null,
    zip_code: residenceResult.data?.zip_code ?? null,
    county: residenceResult.data?.county ?? null,
    agent_info: agentData
      ? {
          full_name: agentData.name ?? (agentData.first_name ? `${agentData.first_name} ${agentData.last_name || ''}`.trim() : null),
          first_name: agentData.first_name ?? null,
          last_name: agentData.last_name ?? null,
          email: agentData.email ?? null,
          phone: agentData.phone ?? null,
          agency_name: agentData.agency_name ?? null,
          npn: agentData.npn_number ?? null,
          license_number: agentData.license_number ?? null,
          license_state: agentData.state ?? null,
          business_address: agentData.address ?? null,
          city: agentData.city ?? null,
          state: agentData.state ?? null,
          zip_code: agentData.zip_code ?? null,
          website: agentData.website ?? null,
        }
      : null,
  };
}

/**
 * Fetch policy data from P&C (policies), Health (health_policies), or Life (life_policies) tables.
 */
export async function getPolicyMergeData(
  policyId: string,
  clientId: string,
  categoryHint?: 'pc' | 'health' | 'life'
): Promise<PolicyMergeData> {
  // 1. Try P&C policies table
  if (!categoryHint || categoryHint === 'pc') {
    const { data: pcData } = await supabase
      .from('policies')
      .select('*')
      .eq('id', policyId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (pcData) {
      const fullPremium =
        pcData.total_premium !== null && pcData.total_premium !== undefined
          ? Number(pcData.total_premium)
          : pcData.premium !== null && pcData.premium !== undefined
            ? Number(pcData.premium)
            : null;

      return {
        policy_id: pcData.id,
        client_id: pcData.client_id,
        category: 'pc',
        policy_number: pcData.policy_number ?? null,
        policy_type: pcData.policy_type ?? null,
        policy_subtype: pcData.policy_subtype ?? null,
        company_name: pcData.company_name ?? null,
        writing_company: pcData.writing_company ?? null,
        effective_date: pcData.effective_date ?? null,
        expiration_date: pcData.expiration_date ?? null,
        full_premium: Number.isFinite(fullPremium as number) ? fullPremium : null,
        monthly_premium: pcData.premium ? Number(pcData.premium) : null,
        status: pcData.status ?? null,
        ownership_type: pcData.policy_ownership_type ?? null,
        address: pcData.address ?? null,
        city: pcData.city ?? null,
        state: pcData.state ?? null,
        zip_code: pcData.zip_code ?? null,
        payment_frequency: pcData.policy_payment_frequency ?? null,
        broker_name: pcData.broker_name ?? null,
      };
    }
  }

  // 2. Try Health policies table
  if (!categoryHint || categoryHint === 'health') {
    const { data: hpData } = await supabase
      .from('health_policies')
      .select('*')
      .eq('id', policyId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (hpData) {
      const realIncome = hpData.household_income !== null && hpData.household_income !== undefined
        ? Number(hpData.household_income)
        : null;

      return {
        policy_id: hpData.id,
        client_id: hpData.client_id,
        category: 'health',
        policy_number: hpData.plan_id ?? hpData.application_number ?? null,
        policy_type: hpData.type_plan || 'Health Insurance',
        policy_subtype: 'ACA Health',
        company_name: hpData.company_2026 ?? null,
        carrier: hpData.company_2026 ?? null,
        effective_date: hpData.effective_date ?? null,
        expiration_date: null,
        full_premium: hpData.plan_cost ? Number(hpData.plan_cost) * 12 : null,
        monthly_premium: hpData.plan_cost ? Number(hpData.plan_cost) : null,
        plan_name: hpData.plan_name ?? null,
        plan_id: hpData.plan_id ?? null,
        application_number: hpData.application_number ?? null,
        marketplace_id: hpData.marketplace_account ?? null,
        renovation_status: hpData.renovation_status ?? null,
        enrolled: Boolean(hpData.active),
        tax_credit: hpData.tax_credit ? Number(hpData.tax_credit) : null,
        household_income: Number.isFinite(realIncome as number) ? realIncome : null,
        tax_household_size: hpData.number_of_people_on_tax_return ? Number(hpData.number_of_people_on_tax_return) : null,
        coverage_members_count: hpData.coverage_members_count ? Number(hpData.coverage_members_count) : null,
        npn: hpData.npn ?? null,
      };
    }
  }

  // 3. Try Life policies table
  if (!categoryHint || categoryHint === 'life') {
    const { data: lpData } = await supabase
      .from('life_policies')
      .select('*')
      .eq('id', policyId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (lpData) {
      const [{ data: prods }, { data: bens }] = await Promise.all([
        supabase.from('life_policy_products').select('*').eq('life_policy_id', lpData.id),
        supabase.from('life_policy_beneficiaries').select('*').eq('life_policy_id', lpData.id),
      ]);

      const primaryProd = prods?.[0];
      const benNames = (bens || []).map((b: any) => `${b.name}${b.benefit_percentage ? ` (${b.benefit_percentage}%)` : ''}`).join(', ');
      const totalPct = (bens || []).reduce((acc: number, b: any) => acc + (Number(b.benefit_percentage) || 0), 0);

      return {
        policy_id: lpData.id,
        client_id: lpData.client_id,
        category: 'life',
        policy_number: lpData.policy_number ?? primaryProd?.policy_number ?? null,
        policy_type: 'Life Insurance',
        policy_subtype: primaryProd?.product_type ?? null,
        company_name: primaryProd?.company ?? null,
        effective_date: lpData.effective_date ?? primaryProd?.policy_date ?? null,
        expiration_date: lpData.expiration_date ?? null,
        full_premium: primaryProd?.monthly_premium ? Number(primaryProd.monthly_premium) * 12 : null,
        monthly_premium: primaryProd?.monthly_premium ? Number(primaryProd.monthly_premium) : null,
        product_type: primaryProd?.product_type ?? null,
        policy_date: primaryProd?.policy_date ?? lpData.effective_date ?? null,
        face_amount: primaryProd?.face_amount ? Number(primaryProd.face_amount) : null,
        time_to_pay_premium: primaryProd?.time_to_pay_premium ?? null,
        level_period: primaryProd?.level_period ?? null,
        conversion_credit: primaryProd?.conversion_credit ? Number(primaryProd.conversion_credit) : null,
        beneficiaries_count: bens?.length || 0,
        beneficiaries_names: benNames || null,
        total_beneficiary_percentage: totalPct > 0 ? `${totalPct}%` : null,
      };
    }
  }

  throw new MergeServiceError('That policy does not belong to this client, or you do not have access to it.');
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function text(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

function date(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const formatted = formatIsoToUsDate(value);
  if (!formatted || formatted === 'Not provided') return undefined;
  return formatted;
}

function money(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computeAge(dobIso: string | null | undefined): string | undefined {
  if (!dobIso) return undefined;
  const birthDate = new Date(dobIso);
  if (isNaN(birthDate.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : undefined;
}

function ssnLast4(ssn: string | null | undefined): string | undefined {
  if (!ssn) return undefined;
  const digits = String(ssn).replace(/\D/g, '');
  if (digits.length >= 4) {
    return `***-**-${digits.slice(-4)}`;
  }
  return undefined;
}

function fullAddress(address?: string | null, city?: string | null, state?: string | null, zip?: string | null): string | undefined {
  const parts = [address, city, state && zip ? `${state} ${zip}` : (state || zip)].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

// ---------------------------------------------------------------------------
// Build Map
// ---------------------------------------------------------------------------

export function buildMergeData(
  client: ClientMergeData,
  policy: PolicyMergeData | null,
  now: Date = new Date()
): MergeValues {
  const agent = client.agent_info;

  // Split names safely
  const clientFirstName = client.full_name ? client.full_name.split(' ')[0] : undefined;
  const clientLastName = client.full_name ? client.full_name.split(' ').slice(1).join(' ') : undefined;

  const raw: Record<string, string | undefined> = {
    // 1. Client Identity
    'client.full_name': text(client.full_name),
    'client.first_name': text(clientFirstName),
    'client.last_name': text(clientLastName),
    'client.email': text(client.email),
    'client.secondary_email': text(client.secondary_email),
    'client.phone': text(client.phone),
    'client.secondary_phone': text(client.secondary_phone),
    'client.date_of_birth': date(client.date_of_birth),
    'client.age': computeAge(client.date_of_birth),
    'client.gender': text(client.gender),
    'client.marital_status': text(client.marital_status),
    'client.immigration_status': text(client.immigration_status),
    'client.agency_name': text(client.agency_name),
    'client.assigned_agent_name': text(agent?.full_name),
    'client.ssn_last4': ssnLast4(client.ssn),

    // 2. Client Address
    'client.address': text(client.address),
    'client.address_line_2': text(client.address_line_2),
    'client.city': text(client.city),
    'client.county': text(client.county),
    'client.state': text(client.state),
    'client.zip_code': text(client.zip_code),
    'client.full_address': fullAddress(client.address, client.city, client.state, client.zip_code),

    // 3. Household & Income (Mapped strictly to stored household_income)
    'client.total_income': policy?.category === 'health' ? money(policy.household_income) : undefined,
    'client.tax_household_size': policy?.category === 'health' && policy.tax_household_size ? String(policy.tax_household_size) : undefined,
    'client.coverage_members_count': policy?.category === 'health' && policy.coverage_members_count ? String(policy.coverage_members_count) : undefined,

    // 4. Agent Information (Mapped strictly to profiles.npn_number)
    'agent.full_name': text(agent?.full_name),
    'agent.first_name': text(agent?.first_name),
    'agent.last_name': text(agent?.last_name),
    'agent.email': text(agent?.email),
    'agent.phone': text(agent?.phone),
    'agent.agency_name': text(agent?.agency_name),
    'agent.npn': text(agent?.npn),
    'agent.license_number': text(agent?.license_number),
    'agent.license_state': text(agent?.license_state),
    'agent.business_address': text(agent?.business_address),
    'agent.city': text(agent?.city),
    'agent.state': text(agent?.state),
    'agent.zip_code': text(agent?.zip_code),
    'agent.website': text(agent?.website),

    // 5. Health Policy
    'health.plan_name': policy?.category === 'health' ? text(policy.plan_name) : undefined,
    'health.plan_id': policy?.category === 'health' ? text(policy.plan_id) : undefined,
    'health.policy_number': policy?.category === 'health' ? text(policy.policy_number) : undefined,
    'health.application_number': policy?.category === 'health' ? text(policy.application_number) : undefined,
    'health.marketplace_id': policy?.category === 'health' ? text(policy.marketplace_id) : undefined,
    'health.carrier': policy?.category === 'health' ? text(policy.carrier) : undefined,
    'health.company': policy?.category === 'health' ? text(policy.company_name) : undefined,
    'health.renovation_status': policy?.category === 'health' ? text(policy.renovation_status) : undefined,
    'health.enrolled': policy?.category === 'health' ? (policy.enrolled ? 'Yes' : 'No') : undefined,
    'health.effective_date': policy?.category === 'health' ? date(policy.effective_date) : undefined,
    'health.monthly_premium': policy?.category === 'health' ? money(policy.monthly_premium) : undefined,
    'health.tax_credit': policy?.category === 'health' ? money(policy.tax_credit) : undefined,
    'health.household_income': policy?.category === 'health' ? money(policy.household_income) : undefined,
    'health.tax_household_size': policy?.category === 'health' && policy.tax_household_size ? String(policy.tax_household_size) : undefined,
    'health.coverage_members_count': policy?.category === 'health' && policy.coverage_members_count ? String(policy.coverage_members_count) : undefined,
    'health.agent_name': policy?.category === 'health' ? text(policy.npn || agent?.full_name) : undefined,

    // 6. Property & Casualty
    'pc.policy_number': policy?.category === 'pc' ? text(policy.policy_number) : undefined,
    'pc.policy_type': policy?.category === 'pc' ? text(policy.policy_type) : undefined,
    'pc.line_of_business': policy?.category === 'pc' ? text(policy.policy_type) : undefined,
    'pc.status': policy?.category === 'pc' ? text(policy.status) : undefined,
    'pc.company': policy?.category === 'pc' ? text(policy.company_name) : undefined,
    'pc.writing_company': policy?.category === 'pc' ? text(policy.writing_company) : undefined,
    'pc.effective_date': policy?.category === 'pc' ? date(policy.effective_date) : undefined,
    'pc.expiration_date': policy?.category === 'pc' ? date(policy.expiration_date) : undefined,
    'pc.full_premium': policy?.category === 'pc' ? money(policy.full_premium) : undefined,
    'pc.monthly_premium': policy?.category === 'pc' ? money(policy.monthly_premium) : undefined,
    'pc.ownership_type': policy?.category === 'pc' ? text(policy.ownership_type) : undefined,
    'pc.policy_address': policy?.category === 'pc' ? fullAddress(policy.address, policy.city, policy.state, policy.zip_code) : undefined,
    'pc.term': policy?.category === 'pc' ? text(policy.payment_frequency) : undefined,
    'pc.agent_name': policy?.category === 'pc' ? text(policy.broker_name || agent?.full_name) : undefined,

    // Legacy Aliases for P&C
    'policy.policy_number': policy ? text(policy.policy_number) : undefined,
    'policy.policy_type': policy ? text(policy.policy_type) : undefined,
    'policy.policy_subtype': policy ? text(policy.policy_subtype) : undefined,
    'policy.company_name': policy ? text(policy.company_name) : undefined,
    'policy.effective_date': policy ? date(policy.effective_date) : undefined,
    'policy.expiration_date': policy ? date(policy.expiration_date) : undefined,
    'policy.full_premium': policy ? money(policy.full_premium) : undefined,

    // 7. Life Policy & Beneficiaries
    'life.product_type': policy?.category === 'life' ? text(policy.product_type) : undefined,
    'life.company': policy?.category === 'life' ? text(policy.company_name) : undefined,
    'life.policy_number': policy?.category === 'life' ? text(policy.policy_number) : undefined,
    'life.policy_date': policy?.category === 'life' ? date(policy.policy_date) : undefined,
    'life.face_amount': policy?.category === 'life' ? money(policy.face_amount) : undefined,
    'life.monthly_premium': policy?.category === 'life' ? money(policy.monthly_premium) : undefined,
    'life.time_to_pay_premium': policy?.category === 'life' ? text(policy.time_to_pay_premium) : undefined,
    'life.level_period': policy?.category === 'life' ? text(policy.level_period) : undefined,
    'life.conversion_credit': policy?.category === 'life' ? money(policy.conversion_credit) : undefined,
    'life.status': policy?.category === 'life' ? text(policy.status) : undefined,
    'life.beneficiaries_count': policy?.category === 'life' && policy.beneficiaries_count ? String(policy.beneficiaries_count) : undefined,
    'life.beneficiaries_names': policy?.category === 'life' ? text(policy.beneficiaries_names) : undefined,
    'life.total_beneficiary_percentage': policy?.category === 'life' ? text(policy.total_beneficiary_percentage) : undefined,

    // 8. System & Date
    'system.current_date': date(now.toISOString().slice(0, 10)),
    'system.current_datetime': `${date(now.toISOString().slice(0, 10))} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    'system.current_year': String(now.getFullYear()),
    'current_date': date(now.toISOString().slice(0, 10)),
    'current_year': String(now.getFullYear()),
  };

  // DYNAMIC HEALTH TAX MEMBERS RESOLUTION (Supports N members dynamically)
  const taxMembers = policy?.category === 'health' && Array.isArray(policy.tax_members) ? policy.tax_members : [];
  if (taxMembers.length > 0) {
    raw['health.tax_members_count'] = String(taxMembers.length);
    raw['health.tax_members_names'] = taxMembers.map((m: any) => `${m.full_name || m.name}${m.relationship ? ` (${m.relationship})` : ''}`).join(', ');
    raw['health.coverage_members_names'] = taxMembers.map((m: any) => m.full_name || m.name).filter(Boolean).join(', ');

    taxMembers.forEach((member: any, index: number) => {
      const num = index + 1;
      raw[`health.tax_member_${num}.full_name`] = text(member.full_name || member.name);
      raw[`health.tax_member_${num}.date_of_birth`] = date(member.date_of_birth || member.dob);
      raw[`health.tax_member_${num}.relationship`] = text(member.relationship || member.type);
    });
  }

  const values: MergeValues = {};
  for (const [token, value] of Object.entries(raw)) {
    if (value !== undefined) values[token] = value;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Substitutes resolved tokens in a single string.
 */
export function substitute(input: string, values: MergeValues): string {
  if (typeof input !== 'string') return '';
  const textWithBraces = normalizeVariableDelimiters(input);
  return textWithBraces.replace(TOKEN_PATTERN, (match, rawToken: string) => {
    const token = rawToken.replace(/^\{\{|\}\}$/g, '').trim();
    const value = values[token];
    return value === undefined ? match : value;
  });
}

export function renderTemplateContent(
  content: TemplateContent,
  values: MergeValues
): TemplateContent {
  if (!content) return { blocks: [] };

  const safeBlocks: TemplateBlock[] = Array.isArray(content.blocks)
    ? content.blocks.map((block) => {
        if (!block) return block;
        if (isTextBlock(block)) {
          return { ...block, text: substitute(block.text || '', values) };
        }
        if (isListBlock(block)) {
          return { ...block, items: (block.items || []).map((item) => substitute(item || '', values)) };
        }
        return { ...block };
      })
    : [];

  const html = typeof content.html === 'string' ? substitute(content.html, values) : undefined;

  return {
    ...content,
    ...(html ? { html } : {}),
    blocks: safeBlocks,
  };
}

export function renderConsentText(consentText: string, values: MergeValues): string {
  return substitute(consentText || '', values);
}

// ---------------------------------------------------------------------------
// Unresolved variables
// ---------------------------------------------------------------------------

export function findUnresolvedVariables(
  variablesUsed: string[] | undefined | null,
  values: MergeValues,
  hasPolicy: boolean
): UnresolvedVariable[] {
  const unresolved: UnresolvedVariable[] = [];
  const safeVariables = Array.isArray(variablesUsed) ? variablesUsed : [];

  for (const rawToken of safeVariables) {
    if (!rawToken) continue;
    const token = rawToken.replace(/^\{\{|\}\}$/g, '').trim();
    if (values[token] !== undefined) continue;

    const registryVar = TOKEN_LOOKUP[token];
    const label = registryVar ? `${registryVar.group} · ${registryVar.label}` : token;
    const isPolicyToken = registryVar?.requiresPolicy || token.startsWith('policy.') || token.startsWith('pc.') || token.startsWith('health.') || token.startsWith('life.');

    if (isPolicyToken && !hasPolicy) {
      unresolved.push({
        token,
        label,
        reason: `This document uses a policy field (${token}), but no policy was selected.`,
        needsPolicy: true,
      });
      continue;
    }

    if (!ALLOWED_VARIABLES.includes(token)) {
      unresolved.push({
        token,
        label,
        reason: `Variable ${token} is not recognized`,
        needsPolicy: false,
      });
    } else {
      unresolved.push({
        token,
        label,
        reason: isPolicyToken
          ? 'The selected policy has no value recorded for this field.'
          : 'This client has no value recorded for this field.',
        needsPolicy: false,
      });
    }
  }

  return unresolved;
}

// ---------------------------------------------------------------------------
// Snapshot & Hash
// ---------------------------------------------------------------------------

export function buildMergeSnapshot(
  values: MergeValues,
  unresolved: UnresolvedVariable[],
  clientId: string,
  policyId: string | null,
  renderedConsentText: string,
  now: Date = new Date()
): MergeDataSnapshot {
  const safeUnresolved = Array.isArray(unresolved) ? unresolved : [];
  return {
    values: values || {},
    unresolved: safeUnresolved.map((u) => u.token).sort(),
    rendered_consent_text: renderedConsentText || '',
    sources: { client_id: clientId, policy_id: policyId },
    captured_at: now.toISOString(),
    snapshot_version: 1,
  };
}

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

export async function resolveTemplateVariables(params: {
  htmlContent: string;
  consentText: string;
  clientId: string;
  policyId?: string;
  policyType?: 'pc' | 'health' | 'life';
}): Promise<{ resolvedHtml: string; resolvedConsentText: string }> {
  const clientData = await getClientMergeData(params.clientId);

  let policyData: PolicyMergeData | null = null;
  if (params.policyId) {
    policyData = await getPolicyMergeData(params.policyId, params.clientId, params.policyType);
  }

  const values = buildMergeData(clientData, policyData);
  const resolvedHtml = substitute(params.htmlContent, values);
  const resolvedConsentText = substitute(params.consentText, values);

  return { resolvedHtml, resolvedConsentText };
}
