import { SupabaseClient } from '@supabase/supabase-js';
import { ExtractedCommissionRow } from '@/types/commissions';
import { performFocusedMemberIdOcr } from './extraction-service';

export function normalizePolicyNumber(val?: string | null): string {
  if (!val) return '';
  return val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function normalizeCarrier(val?: string | null): string {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeText(val?: string | null): string {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface DBClientRecord {
  id?: string;
  full_name?: string;
  agent_id?: string;
}

interface DBProfileRecord {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface DBPolicyRecord {
  id: string;
  policy_number?: string;
  company_name?: string;
  effective_date?: string;
  premium_amount?: number;
  premium?: number;
  agent_id?: string;
  client_id?: string;
  clients?: DBClientRecord | null;
  profiles?: DBProfileRecord | null;
}

export async function matchExtractedRowsToCRM(
  rows: ExtractedCommissionRow[],
  agentId: string,
  supabase: SupabaseClient,
  isPrivileged: boolean = false,
  sourceBuffer?: Buffer
): Promise<ExtractedCommissionRow[]> {
  // Query P&C policies (pc_policies table or fallback to policies table)
  let rawPolicies: DBPolicyRecord[] = [];
  const { data: pcPolicies, error: pcErr } = await supabase
    .from('pc_policies')
    .select(`
      id,
      policy_number,
      company_name,
      effective_date,
      premium_amount,
      agent_id,
      client_id,
      clients (
        id,
        full_name,
        agent_id
      ),
      profiles (
        id,
        name,
        first_name,
        last_name,
        email
      )
    `);

  if (!pcErr && pcPolicies && pcPolicies.length > 0) {
    rawPolicies = pcPolicies as unknown as DBPolicyRecord[];
  } else {
    const { data: polData } = await supabase
      .from('policies')
      .select(`
        id,
        policy_number,
        company_name,
        effective_date,
        premium,
        client_id,
        clients (
          id,
          full_name,
          agent_id
        )
      `);
    if (polData) {
      rawPolicies = (polData as unknown as DBPolicyRecord[]).map((p) => ({
        ...p,
        premium_amount: p.premium,
      }));
    }
  }

  if (!rawPolicies || rawPolicies.length === 0) {
    return rows;
  }

  // AGENT SCOPING: Restrict candidate policies to the authenticated agent's own assigned book unless privileged role
  const scopedPolicies = rawPolicies.filter((p) => {
    if (isPrivileged || !agentId) return true;
    const policyAgentId = p.agent_id || p.clients?.agent_id || null;
    return policyAgentId === agentId;
  });

  if (scopedPolicies.length === 0) {
    return rows.map((r) => {
      const normRowPolicy = normalizePolicyNumber(r.membership_or_policy_number);
      if (!normRowPolicy || r.confidence < 0.6) {
        return {
          ...r,
          match_status: 'REVIEW',
          confidence_reason: 'OCR cannot read Member ID / Policy Number clearly',
        };
      }
      return {
        ...r,
        match_status: 'UNMATCHED',
        confidence_reason: 'No matching Member ID / Policy Number found in CRM',
      };
    });
  }

  const policiesList = scopedPolicies.map((p) => {
    const clientObj = p.clients;
    const clientName = clientObj?.full_name || 'Client';
    const agentProfile = p.profiles;
    const agentName = agentProfile
      ? `${agentProfile.first_name || ''} ${agentProfile.last_name || ''}`.trim() || agentProfile.name || agentProfile.email || 'Agent'
      : 'Agent';

    return {
      policy_id: p.id,
      client_id: p.client_id,
      client_name: clientName,
      agent_name: agentName,
      policy_number: p.policy_number,
      carrier: p.company_name,
      effective_date: p.effective_date,
      premium_amount: p.premium_amount,
      norm_policy: normalizePolicyNumber(p.policy_number),
    };
  });

  const matchedRows: ExtractedCommissionRow[] = [];

  for (const row of rows) {
    let normRowPolicy = normalizePolicyNumber(row.membership_or_policy_number);
    let currentPolNumber = row.membership_or_policy_number;

    if (!normRowPolicy || row.confidence < 0.6) {
      matchedRows.push({
        ...row,
        match_status: 'REVIEW',
        confidence_reason: 'OCR cannot read Member ID / Policy Number clearly',
      });
      continue;
    }

    // Attempt 1: Exact Member ID match against scoped policies
    let match = policiesList.find((p) => p.norm_policy === normRowPolicy);

    // Attempt 2: If no exact match and sourceBuffer + bbox available, run Focused 2nd Pass OCR
    if (!match && sourceBuffer && row.bbox) {
      console.log(`[Focused Member ID OCR] No exact CRM match for '${currentPolNumber}'. Triggering Pass 2 on bbox...`);
      const focusedToken = await performFocusedMemberIdOcr(sourceBuffer, row.bbox);
      const normFocusedToken = normalizePolicyNumber(focusedToken);

      if (normFocusedToken && normFocusedToken !== normRowPolicy) {
        console.log(`[Focused Member ID OCR] Pass 2 yielded refined token '${focusedToken}' (was '${currentPolNumber}')`);
        const focusedMatch = policiesList.find((p) => p.norm_policy === normFocusedToken);

        if (focusedMatch) {
          console.log(`[Focused Member ID OCR] Pass 2 exact match SUCCESS for '${focusedToken}'!`);
          match = focusedMatch;
          currentPolNumber = focusedToken;
          normRowPolicy = normFocusedToken;
        }
      }
    }

    if (match) {
      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'MATCHED',
        matched_client_id: match.client_id,
        matched_client_name: match.client_name,
        matched_agent_name: match.agent_name,
        matched_policy_id: match.policy_id,
        matched_policy_number: match.policy_number,
        matched_carrier: match.carrier,
        matched_effective_date: match.effective_date,
        matched_premium_amount: match.premium_amount,
      });
    } else {
      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'UNMATCHED',
        confidence_reason: 'No matching Member ID / Policy Number found in CRM',
      });
    }
  }

  return matchedRows;
}

