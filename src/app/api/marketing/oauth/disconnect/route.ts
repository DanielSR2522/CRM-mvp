import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    const body = await req.json();
    const { accountId, provider } = body;

    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

    let query = dbClient.from('marketing_sender_accounts').update({
      status: 'DISCONNECTED',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (accountId) {
      query = query.eq('id', accountId);
    } else if (provider) {
      query = query.eq('provider', provider);
    } else {
      return NextResponse.json({ error: 'Missing accountId or provider parameter.' }, { status: 400 });
    }

    if (!authUser?.agentId) {
      return NextResponse.json({ error: '401 Unauthorized: Authentication required to disconnect account.' }, { status: 401 });
    }

    query = query.eq('agent_id', authUser.agentId);

    const { error } = await query;
    if (error) {
      console.error('Error disconnecting sender account:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Account disconnected successfully.' });
  } catch (err: any) {
    console.error('Disconnect exception:', err);
    return NextResponse.json({ error: err?.message || 'Failed to disconnect account' }, { status: 500 });
  }
}
