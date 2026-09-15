import { SupabaseClient } from '@supabase/supabase-js';
import { CommissionPayment, DuplicateWarning, LedgerStatus, MatchStatus, PendingPolicy } from '@/types/commissions';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const inMemoryPayments: CommissionPayment[] = [];

/**
 * Duplicate Protection Rule: carrier + policy/member number + payment date + commission amount + transaction code
 */
export async function checkDuplicateCommissionPayment(
  params: {
    policy_id: string;
    policy_number: string;
    carrier: string;
    amount: number;
    payment_date: string;
    transaction_code?: string;
  },
  supabase: SupabaseClient
): Promise<DuplicateWarning> {
  const normCarrier = (params.carrier || '').toLowerCase().trim();
  const normPolicy = (params.policy_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const normTx = (params.transaction_code || '').toUpperCase().trim();

  // 1. Check in-memory payments
  const memoryMatch = inMemoryPayments.find((p) => {
    const pCarrier = (p.carrier || '').toLowerCase().trim();
    const pPolicy = (p.policy_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const pTx = (p.transaction_code || '').toUpperCase().trim();
    return (
      (p.policy_id === params.policy_id || pPolicy === normPolicy) &&
      pCarrier === normCarrier &&
      p.payment_date === params.payment_date &&
      Math.abs(Number(p.amount) - Number(params.amount)) < 0.01 &&
      pTx === normTx
    );
  });

  if (memoryMatch) {
    return {
      is_duplicate: true,
      existing_payment_id: memoryMatch.id,
      message: `A commission payment of $${params.amount.toFixed(2)} on ${params.payment_date} for policy ${params.policy_number} (${params.carrier}) already exists in the ledger. Marked for Review to prevent double-counting.`,
    };
  }

  // 2. Check Database payments
  try {
    const { data } = await supabase
      .from('pc_commission_payments')
      .select('id, amount, payment_date, carrier, policy_number, transaction_code')
      .eq('policy_number', params.policy_number)
      .eq('payment_date', params.payment_date)
      .eq('amount', params.amount)
      .limit(1);

    if (data && data.length > 0) {
      return {
        is_duplicate: true,
        existing_payment_id: data[0].id,
        message: `A commission payment of $${params.amount.toFixed(2)} on ${params.payment_date} for policy ${params.policy_number} (${params.carrier}) already exists in the ledger. Marked for Review to prevent double-counting.`,
      };
    }
  } catch (e) {}

  return { is_duplicate: false };
}

export async function confirmCommissionPayment(
  params: {
    agent_id: string;
    client_id: string;
    policy_id: string;
    policy_number: string;
    carrier: string;
    amount: number;
    payment_date: string;
    transaction_code?: string;
    extraction_method?: 'vision_ai' | 'ocr_fallback';
    extraction_confidence?: number;
    match_status?: MatchStatus;
    original_extracted_value?: string;
    source_document_url?: string;
    source_text?: string;
    created_by?: string;
    force_duplicate?: boolean;
  },
  supabase: SupabaseClient
): Promise<{ success: boolean; payment?: CommissionPayment; warning?: DuplicateWarning; error?: string }> {
  const dbClient = supabase || getSupabaseAdmin();

  // 1. Query full CRM Policy details for linkage
  let policy: any = null;
  const { data: pcPol } = await dbClient
    .from('pc_policies')
    .select(`
      id,
      policy_number,
      company_name,
      effective_date,
      premium_amount,
      client_id,
      agent_id,
      clients ( id, full_name, agent_id ),
      profiles ( id, name, first_name, last_name, email )
    `)
    .eq('id', params.policy_id)
    .single();

  if (pcPol) {
    policy = pcPol;
  } else {
    const { data: stdPol } = await dbClient
      .from('policies')
      .select(`
        id,
        policy_number,
        company_name,
        effective_date,
        premium,
        client_id,
        clients ( id, full_name, agent_id )
      `)
      .eq('id', params.policy_id)
      .single();
    if (stdPol) {
      policy = {
        ...stdPol,
        premium_amount: stdPol.premium,
      };
    }
  }

  if (!policy) {
    policy = {
      id: params.policy_id,
      policy_number: params.policy_number,
      company_name: params.carrier,
      client_id: params.client_id,
      effective_date: new Date().toISOString().split('T')[0],
    };
  }

  const clientObj = policy.clients as any;
  const clientName = clientObj?.full_name || 'Client';
  const agentProfile = policy.profiles as any;
  const agentName = agentProfile
    ? `${agentProfile.first_name || ''} ${agentProfile.last_name || ''}`.trim() || agentProfile.name || agentProfile.email || 'Agent'
    : 'Agent';

  // 2. Perform Duplicate Protection Rule
  if (!params.force_duplicate) {
    const dupCheck = await checkDuplicateCommissionPayment(
      {
        policy_id: params.policy_id,
        policy_number: params.policy_number || policy.policy_number,
        carrier: params.carrier || policy.company_name,
        amount: params.amount,
        payment_date: params.payment_date,
        transaction_code: params.transaction_code,
      },
      supabase
    );

    if (dupCheck.is_duplicate) {
      return {
        success: false,
        warning: dupCheck,
        error: dupCheck.message,
      };
    }
  }

  // 3. Construct Complete Commission Ledger Record (Inherit Agent ownership from Policy / Client)
  const inheritedAgentId = policy.agent_id || clientObj?.agent_id || params.agent_id;
  const ledgerRecord: CommissionPayment = {
    id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    agent_id: inheritedAgentId,
    agent_name: agentName,
    client_id: params.client_id || policy.client_id,
    client_name: clientName,
    policy_id: params.policy_id,
    policy_number: params.policy_number || policy.policy_number,
    carrier: params.carrier || policy.company_name || 'P&C Carrier',
    policy_type: 'Property & Casualty',
    effective_date: policy.effective_date || undefined,
    premium_amount: typeof policy.premium_amount === 'number' ? policy.premium_amount : parseFloat(policy.premium_amount) || undefined,
    amount: params.amount,
    payment_date: params.payment_date,
    transaction_code: params.transaction_code || 'COMM',
    extraction_method: params.extraction_method || 'vision_ai',
    extraction_confidence: typeof params.extraction_confidence === 'number' ? params.extraction_confidence : 1.0,
    match_status: params.match_status || 'MATCHED',
    status: 'Paid' as LedgerStatus,
    source_document_url: params.source_document_url || null,
    source_text: params.source_text || null,
    original_extracted_value: params.original_extracted_value || `$${params.amount.toFixed(2)} (${params.payment_date})`,
    created_by: params.created_by || params.agent_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  inMemoryPayments.unshift(ledgerRecord);

  // Attempt database insertion
  try {
    const dbPayload = {
      agent_id: ledgerRecord.agent_id,
      client_id: ledgerRecord.client_id,
      policy_id: ledgerRecord.policy_id,
      policy_number: ledgerRecord.policy_number,
      carrier: ledgerRecord.carrier,
      amount: ledgerRecord.amount,
      payment_date: ledgerRecord.payment_date,
      status: 'Paid',
      source_document_url: ledgerRecord.source_document_url,
      source_text: ledgerRecord.source_text,
      transaction_code: ledgerRecord.transaction_code,
      extraction_method: ledgerRecord.extraction_method,
      extraction_confidence: ledgerRecord.extraction_confidence,
      original_extracted_value: ledgerRecord.original_extracted_value,
      policy_type: ledgerRecord.policy_type,
      effective_date: ledgerRecord.effective_date,
      premium_amount: ledgerRecord.premium_amount,
      created_by: ledgerRecord.created_by,
      created_at: ledgerRecord.created_at,
      updated_at: ledgerRecord.updated_at,
    };

    const { data: inserted, error: insertErr } = await dbClient
      .from('pc_commission_payments')
      .insert([dbPayload])
      .select('*')
      .single();

    if (!insertErr && inserted) {
      const fullInsertedRecord: CommissionPayment = {
        ...ledgerRecord,
        ...inserted,
        agent_name: agentName,
        client_name: clientName,
        status: 'Paid',
      };
      // Replace memory record with DB row
      const idx = inMemoryPayments.findIndex(p => p.id === ledgerRecord.id);
      if (idx !== -1) inMemoryPayments[idx] = fullInsertedRecord;

      return { success: true, payment: fullInsertedRecord };
    }
  } catch (e) {
    console.warn('[Commission Service] DB insert notice (in-memory ledger fallback active):', e);
  }

  return { success: true, payment: ledgerRecord };
}

export async function updateCommissionLedgerRecord(
  paymentId: string,
  newStatus: LedgerStatus,
  updates?: Partial<CommissionPayment>
): Promise<{ success: boolean; payment?: CommissionPayment }> {
  const admin = getSupabaseAdmin();

  // 1. Update in-memory record
  const memoryIdx = inMemoryPayments.findIndex(p => p.id === paymentId);
  if (memoryIdx !== -1) {
    inMemoryPayments[memoryIdx] = {
      ...inMemoryPayments[memoryIdx],
      status: newStatus,
      ...updates,
      updated_at: new Date().toISOString(),
    };
  }

  // 2. Update DB record if present
  try {
    await admin
      .from('pc_commission_payments')
      .update({
        status: newStatus,
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);
  } catch (e) {}

  const updatedRecord = memoryIdx !== -1 ? inMemoryPayments[memoryIdx] : undefined;
  return { success: true, payment: updatedRecord };
}

export async function fetchAgentCommissionPayments(
  agentId: string,
  supabase: SupabaseClient,
  isPrivileged: boolean = false
): Promise<CommissionPayment[]> {
  const dbClient = supabase || getSupabaseAdmin();
  const memoryAgentPayments = inMemoryPayments.filter((p) => {
    if (isPrivileged) return true;
    return p.agent_id === agentId || p.created_by === agentId;
  });

  try {
    let query = dbClient
      .from('pc_commission_payments')
      .select(`
        *,
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

    if (!isPrivileged && agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data: dbData } = await query.order('payment_date', { ascending: false });

    if (dbData && dbData.length > 0) {
      const formattedDbRecords: CommissionPayment[] = dbData.map((row: any) => {
        const clientObj = row.clients as any;
        const agentProfile = row.profiles as any;
        const agentName = agentProfile
          ? `${agentProfile.first_name || ''} ${agentProfile.last_name || ''}`.trim() || agentProfile.name || agentProfile.email || 'Agent'
          : 'Agent';

        const rawStatus = row.status;
        const normalizedStatus: LedgerStatus =
          rawStatus === 'Confirmed' || rawStatus === 'PAID' ? 'Paid' : (rawStatus as LedgerStatus) || 'Paid';

        return {
          id: row.id,
          agent_id: row.agent_id || clientObj?.agent_id,
          agent_name: agentName,
          client_id: row.client_id,
          client_name: clientObj?.full_name || 'Client',
          policy_id: row.policy_id,
          policy_number: row.policy_number,
          carrier: row.carrier,
          policy_type: row.policy_type || 'Property & Casualty',
          effective_date: row.effective_date || undefined,
          premium_amount: typeof row.premium_amount === 'number' ? row.premium_amount : parseFloat(row.premium_amount) || undefined,
          amount: typeof row.amount === 'number' ? row.amount : parseFloat(row.amount) || 0,
          payment_date: row.payment_date,
          transaction_code: row.transaction_code || 'COMM',
          extraction_method: row.extraction_method || 'vision_ai',
          extraction_confidence: typeof row.extraction_confidence === 'number' ? row.extraction_confidence : 1.0,
          match_status: 'MATCHED',
          status: normalizedStatus,
          source_document_url: row.source_document_url || null,
          source_text: row.source_text || null,
          original_extracted_value: row.original_extracted_value || null,
          created_by: row.created_by || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });

      // Merge memory and DB records removing duplicates by ID
      const ids = new Set(formattedDbRecords.map(r => r.id));
      const filteredMemory = memoryAgentPayments.filter(m => !ids.has(m.id));
      return [...formattedDbRecords, ...filteredMemory];
    }
  } catch (e) {
    console.warn('[Commission Service] DB query error (using memory ledger):', e);
  }

  return memoryAgentPayments;
}

export async function fetchPendingPolicies(
  agentId: string,
  supabase: SupabaseClient,
  isPrivileged: boolean = false
): Promise<PendingPolicy[]> {
  const dbClient = supabase || getSupabaseAdmin();
  const confirmedPayments = await fetchAgentCommissionPayments(agentId, dbClient, isPrivileged);
  
  const paidPolicyIds = new Set(
    confirmedPayments
      .filter((p) => p.status === 'Paid' || (p.status as string) === 'Confirmed' || (p.status as string) === 'PAID')
      .map((p) => p.policy_id)
  );

  const paidPolicyNumbers = new Set(
    confirmedPayments
      .filter((p) => p.status === 'Paid' || (p.status as string) === 'Confirmed' || (p.status as string) === 'PAID')
      .map((p) => (p.policy_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase())
  );

  let rawPolicies: any[] = [];
  try {
    const { data: pcPolicies, error: pcErr } = await dbClient
      .from('pc_policies')
      .select(`
        id,
        policy_number,
        company_name,
        effective_date,
        client_id,
        agent_id,
        clients ( id, full_name, agent_id ),
        profiles ( id, name, first_name, last_name, email )
      `);

    if (!pcErr && pcPolicies && pcPolicies.length > 0) {
      rawPolicies = pcPolicies;
    } else {
      const { data: polData } = await dbClient
        .from('policies')
        .select(`
          id,
          policy_number,
          company_name,
          effective_date,
          policy_type,
          client_id,
          clients ( id, full_name, agent_id )
        `);
      if (polData) {
        rawPolicies = polData;
      }
    }
  } catch (e) {
    console.warn('[Commission Service] Error querying policies for pending list:', e);
  }

  const today = new Date();
  const pendingList: PendingPolicy[] = [];
  const seenPendingKeys = new Set<string>();

  rawPolicies.forEach((p) => {
    // Ownership check: policy belongs to agent if policy.agent_id === agentId OR clients.agent_id === agentId
    const policyAgentId = p.agent_id || (p.clients as any)?.agent_id || null;
    if (!isPrivileged && agentId && policyAgentId !== agentId) {
      return; // Not owned by this agent
    }

    const normPol = (p.policy_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if ((p.id && paidPolicyIds.has(p.id)) || (normPol && paidPolicyNumbers.has(normPol))) {
      return; // Policy already paid in carrier statement
    }

    // Deduplicate pending entries by policy number + client ID
    const pendingKey = `${normPol}_${p.client_id}`;
    if (seenPendingKeys.has(pendingKey)) {
      return;
    }
    seenPendingKeys.add(pendingKey);

    const clientObj = p.clients as any;
    const clientName = clientObj?.full_name || 'Client';
    const agentProfile = p.profiles as any;
    const agentName = agentProfile
      ? `${agentProfile.first_name || ''} ${agentProfile.last_name || ''}`.trim() || agentProfile.name || agentProfile.email || 'Agent'
      : 'Agent';

    let daysPending = 0;
    if (p.effective_date) {
      const eff = new Date(p.effective_date);
      if (!isNaN(eff.getTime())) {
        const diffMs = today.getTime() - eff.getTime();
        daysPending = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    pendingList.push({
      policy_id: p.id,
      client_id: p.client_id,
      client_name: clientName,
      policy_number: p.policy_number || 'N/A',
      carrier: p.company_name || 'P&C Carrier',
      agent_id: policyAgentId || agentId,
      agent_name: agentName,
      policy_type: p.policy_type || 'Property & Casualty',
      effective_date: p.effective_date || '',
      days_pending: daysPending,
      status: 'Pending payment',
    });
  });

  return pendingList;
}

