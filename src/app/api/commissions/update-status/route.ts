import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { updateCommissionLedgerRecord } from '@/lib/commissions/commission-service';
import { LedgerStatus } from '@/types/commissions';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const body = await req.json();
    const { payment_id, status, updates } = body;

    if (!payment_id || !status) {
      return NextResponse.json({ error: 'Missing required parameters: payment_id, status.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', authAgent.agentId)
      .maybeSingle();

    const isPrivileged = profile && ['ADMIN', 'SUPERVISOR', 'MANAGER', 'OWNER'].includes((profile.role || '').toUpperCase());

    if (!isPrivileged) {
      const { data: existingPayment } = await admin
        .from('pc_commission_payments')
        .select('agent_id, created_by')
        .eq('id', payment_id)
        .maybeSingle();

      if (existingPayment) {
        const isOwner = existingPayment.agent_id === authAgent.agentId || existingPayment.created_by === authAgent.agentId;
        if (!isOwner) {
          return NextResponse.json({ error: '403 Forbidden: You are not authorized to modify this commission record.' }, { status: 403 });
        }
      }
    }

    const result = await updateCommissionLedgerRecord(payment_id, status as LedgerStatus, updates);

    return NextResponse.json({
      success: true,
      payment: result.payment,
    });
  } catch (err: any) {
    console.error('[Commission Status API] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update commission record status.' },
      { status: 500 }
    );
  }
}
