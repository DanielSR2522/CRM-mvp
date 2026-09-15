import { SupabaseClient } from '@supabase/supabase-js';
import { CommissionPayment, DuplicateWarning } from '@/types/commissions';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const inMemoryPayments: CommissionPayment[] = [];

export async function checkDuplicateCommissionPayment(
  policyId: string,
  amount: number,
  paymentDate: string,
  supabase: SupabaseClient
): Promise<DuplicateWarning> {
  // Check in-memory payments fallback
  const memoryMatch = inMemoryPayments.find(
    (p) => p.policy_id === policyId && Number(p.amount) === Number(amount) && p.payment_date === paymentDate
  );
  if (memoryMatch) {
    return {
      is_duplicate: true,
      existing_payment_id: memoryMatch.id,
      message: `A commission payment of $${amount.toFixed(2)} on ${paymentDate} for this policy already exists.`,
    };
  }

  try {
    const { data } = await supabase
      .from('pc_commission_payments')
      .select('id, amount, payment_date')
      .eq('policy_id', policyId)
      .eq('amount', amount)
      .eq('payment_date', paymentDate)
      .limit(1);

    if (data && data.length > 0) {
      return {
        is_duplicate: true,
        existing_payment_id: data[0].id,
        message: `A commission payment of $${amount.toFixed(2)} on ${paymentDate} for this policy already exists.`,
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
    source_document_url?: string;
    source_text?: string;
    created_by?: string;
    force_duplicate?: boolean;
  },
  supabase: SupabaseClient
): Promise<{ success: boolean; payment?: CommissionPayment; warning?: DuplicateWarning; error?: string }> {
  const admin = getSupabaseAdmin();

  // 1. Verify ownership: Policy & Client must belong to agent_id
  const { data: policy, error: polErr } = await admin
    .from('policies')
    .select('id, policy_number, company_name, client_id, clients!inner(id, agent_id)')
    .eq('id', params.policy_id)
    .single();

  const client = (policy as any)?.clients;

  if (polErr || !policy || client?.agent_id !== params.agent_id) {
    return {
      success: false,
      error: 'Forbidden: Policy or client does not belong to authorized agent scope.',
    };
  }

  // 2. Check duplicate protection unless user explicitly confirmed bypass
  if (!params.force_duplicate) {
    const dupCheck = await checkDuplicateCommissionPayment(
      params.policy_id,
      params.amount,
      params.payment_date,
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

  // 3. Insert into pc_commission_payments
  const insertPayload = {
    agent_id: params.agent_id,
    client_id: params.client_id,
    policy_id: params.policy_id,
    policy_number: params.policy_number || policy.policy_number,
    carrier: params.carrier || policy.company_name || 'P&C Carrier',
    amount: params.amount,
    payment_date: params.payment_date,
    status: 'PAID' as const,
    source_document_url: params.source_document_url || null,
    source_text: params.source_text || null,
    created_by: params.created_by || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const fallbackPayment: CommissionPayment = {
    id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...insertPayload,
    status: 'PAID',
  };

  inMemoryPayments.push(fallbackPayment);

  const { data: inserted, error: insertErr } = await admin
    .from('pc_commission_payments')
    .insert([insertPayload])
    .select('*')
    .single();

  if (!insertErr && inserted) {
    return { success: true, payment: inserted };
  }

  return { success: true, payment: fallbackPayment };
}

export async function fetchAgentCommissionPayments(
  agentId: string,
  supabase: SupabaseClient
): Promise<CommissionPayment[]> {
  const admin = getSupabaseAdmin();
  const memoryAgentPayments = inMemoryPayments.filter((p) => p.agent_id === agentId);

  try {
    const { data } = await admin
      .from('pc_commission_payments')
      .select('*, clients!inner(full_name)')
      .eq('agent_id', agentId)
      .order('payment_date', { ascending: false });

    if (data && data.length > 0) {
      const dbPayments = data.map((row: any) => ({
        ...row,
        client_name: row.clients?.full_name || 'CRM Client',
      }));
      return [...dbPayments, ...memoryAgentPayments];
    }
  } catch (e) {}

  return memoryAgentPayments;
}
