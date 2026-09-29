import { SupabaseClient } from '@supabase/supabase-js';
import { ExtractedCommissionRow } from '@/types/commissions';
import { performFocusedMemberIdOcr } from './extraction-service';
import { getPcSharedAgentIds } from './commission-service';

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

export function computeNameSimilarity(name1?: string | null, name2?: string | null): number {
  if (!name1 || !name2) return 0;
  const clean1 = name1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const clean2 = name2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!clean1 || !clean2) return 0;
  if (clean1 === clean2) return 1.0;

  const tokens1 = clean1.split(' ').filter((t) => t.length > 1);
  const tokens2 = clean2.split(' ').filter((t) => t.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let common = 0;
  set1.forEach((t) => {
    if (set2.has(t)) common++;
  });

  const dice = (2 * common) / (set1.size + set2.size);

  const isSubset1In2 = tokens1.every((t) => set2.has(t));
  const isSubset2In1 = tokens2.every((t) => set1.has(t));
  if ((isSubset1In2 || isSubset2In1) && Math.min(set1.size, set2.size) >= 2) {
    return Math.max(0.85, dice);
  }

  return dice;
}

export function isCarrierMatch(carrier1?: string | null, carrier2?: string | null): boolean {
  const norm1 = normalizeCarrier(carrier1);
  const norm2 = normalizeCarrier(carrier2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;
  return norm1.includes(norm2) || norm2.includes(norm1);
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

  const authorizedAgentIds = isPrivileged ? [] : await getPcSharedAgentIds(agentId, supabase);
  const scopedPolicies = rawPolicies.filter((p) => {
    if (isPrivileged || !agentId) return true;
    const policyAgentId = p.agent_id || p.clients?.agent_id || null;
    return policyAgentId && authorizedAgentIds.includes(policyAgentId);
  });

  if (scopedPolicies.length === 0) {
    return rows.map((r) => {
      if (!r.payment_date) {
        return {
          ...r,
          match_status: 'REVIEW',
          confidence: 0.5,
          confidence_reason: 'Payment date missing — verify before confirming',
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
    const rowClient = row.client_name;
    const rowCarrier = row.carrier;

    if (!row.payment_date) {
      matchedRows.push({
        ...row,
        match_status: 'REVIEW',
        confidence: 0.5,
        confidence_reason: 'Payment date missing — verify before confirming',
      });
      continue;
    }

    // Tier 1: Exact Policy Number Match
    let exactMatch = normRowPolicy && normRowPolicy.length >= 3
      ? policiesList.find((p) => p.norm_policy === normRowPolicy)
      : undefined;

    if (!exactMatch && sourceBuffer && row.bbox && normRowPolicy) {
      console.log(`[Focused Member ID OCR] No exact CRM match for '${currentPolNumber}'. Triggering Pass 2...`);
      const focusedToken = await performFocusedMemberIdOcr(sourceBuffer, row.bbox);
      const normFocusedToken = normalizePolicyNumber(focusedToken);

      if (normFocusedToken && normFocusedToken !== normRowPolicy) {
        const focusedMatch = policiesList.find((p) => p.norm_policy === normFocusedToken);
        if (focusedMatch) {
          exactMatch = focusedMatch;
          currentPolNumber = focusedToken;
          normRowPolicy = normFocusedToken;
        }
      }
    }

    if (exactMatch) {
      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'MATCHED',
        matched_client_id: exactMatch.client_id,
        matched_client_name: exactMatch.client_name,
        matched_agent_name: exactMatch.agent_name,
        matched_policy_id: exactMatch.policy_id,
        matched_policy_number: exactMatch.policy_number,
        matched_carrier: exactMatch.carrier,
        matched_effective_date: exactMatch.effective_date,
        matched_premium_amount: exactMatch.premium_amount,
      });
      continue;
    }

    // Tier 2: Containment Base Policy Match
    const containmentCandidates = normRowPolicy && normRowPolicy.length >= 5
      ? policiesList.filter((p) => p.norm_policy && p.norm_policy.length >= 5 && (p.norm_policy.includes(normRowPolicy) || normRowPolicy.includes(p.norm_policy)))
      : [];

    if (containmentCandidates.length > 0) {
      const supportedCandidate = containmentCandidates.find((p) => {
        const sim = computeNameSimilarity(rowClient, p.client_name);
        const cMatch = isCarrierMatch(rowCarrier, p.carrier);
        return sim >= 0.4 || cMatch;
      }) || containmentCandidates[0];

      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'REVIEW',
        confidence: 0.7,
        confidence_reason: containmentCandidates.length > 1
          ? 'Multiple base policy match candidates found'
          : 'Base policy number matched — verify policy suffix & client',
        matched_client_id: supportedCandidate.client_id,
        matched_client_name: supportedCandidate.client_name,
        matched_agent_name: supportedCandidate.agent_name,
        matched_policy_id: supportedCandidate.policy_id,
        matched_policy_number: supportedCandidate.policy_number,
        matched_carrier: supportedCandidate.carrier,
        matched_effective_date: supportedCandidate.effective_date,
        matched_premium_amount: supportedCandidate.premium_amount,
      });
      continue;
    }

    // Tier 3: Client Name + Carrier Agreement Match
    const nameCarrierCandidates = policiesList.filter((p) => {
      const cMatch = isCarrierMatch(rowCarrier, p.carrier);
      const sim = computeNameSimilarity(rowClient, p.client_name);
      return cMatch && sim >= 0.55;
    });

    if (nameCarrierCandidates.length > 0) {
      const bestCandidate = nameCarrierCandidates.sort((a, b) => 
        computeNameSimilarity(rowClient, b.client_name) - computeNameSimilarity(rowClient, a.client_name)
      )[0];

      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'REVIEW',
        confidence: 0.65,
        confidence_reason: nameCarrierCandidates.length > 1
          ? 'Multiple client & carrier match candidates found'
          : 'Matched by client name and carrier — policy number differs',
        matched_client_id: bestCandidate.client_id,
        matched_client_name: bestCandidate.client_name,
        matched_agent_name: bestCandidate.agent_name,
        matched_policy_id: bestCandidate.policy_id,
        matched_policy_number: bestCandidate.policy_number,
        matched_carrier: bestCandidate.carrier,
        matched_effective_date: bestCandidate.effective_date,
        matched_premium_amount: bestCandidate.premium_amount,
      });
      continue;
    }

    // Tier 4: Strong Client Name Alone Match (similarity >= 0.75)
    const nameCandidates = policiesList.filter((p) => computeNameSimilarity(rowClient, p.client_name) >= 0.75);

    if (nameCandidates.length > 0) {
      const bestCandidate = nameCandidates.sort((a, b) => 
        computeNameSimilarity(rowClient, b.client_name) - computeNameSimilarity(rowClient, a.client_name)
      )[0];

      matchedRows.push({
        ...row,
        membership_or_policy_number: currentPolNumber,
        match_status: 'REVIEW',
        confidence: 0.6,
        confidence_reason: nameCandidates.length > 1
          ? 'Multiple matching client candidates found'
          : 'Possible match by client name — verify policy details',
        matched_client_id: bestCandidate.client_id,
        matched_client_name: bestCandidate.client_name,
        matched_agent_name: bestCandidate.agent_name,
        matched_policy_id: bestCandidate.policy_id,
        matched_policy_number: bestCandidate.policy_number,
        matched_carrier: bestCandidate.carrier,
        matched_effective_date: bestCandidate.effective_date,
        matched_premium_amount: bestCandidate.premium_amount,
      });
      continue;
    }

    // Tier 6: Unmatched
    matchedRows.push({
      ...row,
      membership_or_policy_number: currentPolNumber,
      match_status: 'UNMATCHED',
      confidence_reason: 'No matching Member ID / Policy Number or Client found in CRM',
    });
  }

  return matchedRows;
}

