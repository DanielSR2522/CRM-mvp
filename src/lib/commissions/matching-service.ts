import { SupabaseClient } from '@supabase/supabase-js';
import { ExtractedCommissionRow, MatchStatus } from '@/types/commissions';

function normalizePolicyNum(val?: string | null): string {
  if (!val) return '';
  return val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeText(val?: string | null): string {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function matchExtractedRowsToCRM(
  rows: ExtractedCommissionRow[],
  agentId: string,
  supabase: SupabaseClient
): Promise<ExtractedCommissionRow[]> {
  // Query all policies owned by or accessible to this agent
  const { data: policies, error } = await supabase
    .from('policies')
    .select('id, policy_number, company_name, policy_type, client_id, clients!inner(id, full_name, agent_id)');

  if (error || !policies) {
    console.error('Error fetching policies for matching:', error);
    return rows;
  }

  // Filter policies strictly belonging to agentId
  const agentPolicies = (policies as any[]).filter((p) => (p.clients as any)?.agent_id === agentId);

  return rows.map((row) => {
    const normExtractedNum = normalizePolicyNum(row.policy_or_membership_number);
    const normExtractedName = normalizeText(row.client_name);

    if (!normExtractedNum) {
      return {
        ...row,
        match_status: 'NOT_FOUND',
      };
    }

    // 1. PRIMARY MATCH: Exact normalized policy number match
    const exactPolicyMatches = agentPolicies.filter(
      (p) => normalizePolicyNum(p.policy_number) === normExtractedNum
    );

    if (exactPolicyMatches.length === 1) {
      const match = exactPolicyMatches[0];
      const client = match.clients as any;
      const normClientName = normalizeText(client?.full_name);

      const isNameSimilar =
        normClientName &&
        normExtractedName &&
        (normClientName.includes(normExtractedName) || normExtractedName.includes(normClientName));

      return {
        ...row,
        match_status: isNameSimilar ? 'MATCHED' : 'NEEDS_REVIEW',
        matched_client_id: client?.id,
        matched_client_name: client?.full_name,
        matched_policy_id: match.id,
        matched_policy_number: match.policy_number,
        matched_carrier: match.company_name,
        confidence_score: isNameSimilar ? 0.95 : 0.70,
      };
    }

    if (exactPolicyMatches.length > 1) {
      // Multiple policies match exact number: needs review
      const first = exactPolicyMatches[0];
      const client = first.clients as any;
      return {
        ...row,
        match_status: 'NEEDS_REVIEW',
        matched_client_id: client?.id,
        matched_client_name: client?.full_name,
        matched_policy_id: first.id,
        matched_policy_number: first.policy_number,
        matched_carrier: first.company_name,
        confidence_score: 0.60,
      };
    }

    // Partial or client-name matching for NEEDS_REVIEW recommendation (never automatic MATCHED)
    const nameMatchPolicy = agentPolicies.find((p) => {
      const client = p.clients as any;
      const normName = normalizeText(client?.full_name);
      return normName && normExtractedName && normName.includes(normExtractedName);
    });

    if (nameMatchPolicy) {
      const client = nameMatchPolicy.clients as any;
      return {
        ...row,
        match_status: 'NEEDS_REVIEW',
        matched_client_id: client?.id,
        matched_client_name: client?.full_name,
        matched_policy_id: nameMatchPolicy.id,
        matched_policy_number: nameMatchPolicy.policy_number,
        matched_carrier: nameMatchPolicy.company_name,
        confidence_score: 0.40,
      };
    }

    return {
      ...row,
      match_status: 'NOT_FOUND',
    };
  });
}
