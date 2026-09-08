import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

    if (!authUser?.agentId) {
      return NextResponse.json({ senderAccounts: [], unauthenticated: true });
    }

    const { data, error } = await dbClient
      .from('marketing_sender_accounts')
      .select('*')
      .or(`agent_id.eq.${authUser.agentId},agent_id.is.null`)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching sender accounts:', error.message);
      return NextResponse.json({ senderAccounts: [] }, { status: 200 });
    }

    return NextResponse.json({ senderAccounts: data || [] });
  } catch (err: any) {
    console.error('Exception in sender-accounts route:', err);
    return NextResponse.json({ senderAccounts: [] }, { status: 200 });
  }
}
