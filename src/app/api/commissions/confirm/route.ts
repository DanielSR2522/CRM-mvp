import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { confirmCommissionPayment } from '@/lib/commissions/commission-service';

export async function POST(req: NextRequest) {
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const body = await req.json();
    const {
      client_id,
      policy_id,
      policy_number,
      carrier,
      amount,
      payment_date,
      source_document_url,
      source_text,
      force_duplicate,
    } = body;

    if (!client_id || !policy_id || !amount || !payment_date) {
      return NextResponse.json(
        { error: 'Missing required parameters: client_id, policy_id, amount, payment_date.' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const result = await confirmCommissionPayment(
      {
        agent_id: authAgent.agentId,
        client_id,
        policy_id,
        policy_number,
        carrier,
        amount: parseFloat(amount),
        payment_date,
        source_document_url,
        source_text,
        created_by: authAgent.agentId,
        force_duplicate: Boolean(force_duplicate),
      },
      admin
    );

    if (!result.success) {
      if (result.warning) {
        return NextResponse.json(
          {
            error: result.error,
            warning: result.warning,
            requires_confirmation: true,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: result.error || 'Failed to confirm payment.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      payment: result.payment,
    });
  } catch (err: any) {
    console.error('Commission confirmation API error:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error processing payment confirmation.' },
      { status: 500 }
    );
  }
}
