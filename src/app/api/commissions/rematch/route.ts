import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { matchExtractedRowsToCRM } from '@/lib/commissions/matching-service';
import { ExtractedCommissionRow } from '@/types/commissions';

export async function POST(req: NextRequest) {
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const body = await req.json();
    const row = body.row as ExtractedCommissionRow;

    if (!row) {
      return NextResponse.json({ error: 'No row provided.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    let isPrivileged = false;
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', authAgent.agentId)
        .maybeSingle();

      if (profile) {
        const role = (profile.role || 'AGENT').toUpperCase();
        if (['ADMIN', 'SUPERVISOR', 'MANAGER', 'OWNER'].includes(role)) {
          isPrivileged = true;
        }
      }
    } catch (e) {}

    const matched = await matchExtractedRowsToCRM([row], authAgent.agentId, admin, isPrivileged);

    return NextResponse.json({
      success: true,
      row: matched[0],
    });
  } catch (err: any) {
    console.error('[Commission Rematch API] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to re-match row.' },
      { status: 500 }
    );
  }
}
