import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getPcSharedAgentIds } from '@/lib/commissions/commission-service';

export async function GET(req: NextRequest) {
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: policies, error } = await admin
      .from('policies')
      .select('id, policy_number, company_name, policy_type, client_id, clients!inner(id, full_name, agent_id)');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const authorizedAgentIds = await getPcSharedAgentIds(authAgent.agentId, admin);

    const agentPolicies = (policies || [])
      .filter((p: any) => p.clients?.agent_id && authorizedAgentIds.includes(p.clients.agent_id))
      .map((p: any) => ({
        policy_id: p.id,
        policy_number: p.policy_number,
        company_name: p.company_name || 'P&C Carrier',
        client_id: p.client_id,
        client_name: p.clients?.full_name || 'CRM Client',
      }));

    return NextResponse.json({ success: true, policies: agentPolicies });
  } catch (err: any) {
    console.error('Commission policies lookup API error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch policies.' }, { status: 500 });
  }
}
