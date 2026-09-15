import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAgentCommissionPayments } from '@/lib/commissions/commission-service';

export async function GET(req: NextRequest) {
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const payments = await fetchAgentCommissionPayments(authAgent.agentId, admin);

    return NextResponse.json({
      success: true,
      payments,
    });
  } catch (err: any) {
    console.error('Commission list API error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch commissions.' }, { status: 500 });
  }
}
