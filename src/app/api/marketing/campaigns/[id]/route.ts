import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { validateCampaignOwnership } from '@/lib/marketing/auth-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const campaignId = resolvedParams.id;
    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

    const authResult = await validateCampaignOwnership(req, campaignId, dbClient);
    if (!authResult.authorized || !authResult.campaign) {
      return NextResponse.json(
        { error: authResult.error || 'Access denied' },
        { status: authResult.status }
      );
    }

    return NextResponse.json(authResult.campaign);
  } catch (err: any) {
    console.error('GET /api/marketing/campaigns/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const campaignId = resolvedParams.id;
    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

    const authResult = await validateCampaignOwnership(req, campaignId, dbClient);
    if (!authResult.authorized || !authResult.campaign) {
      return NextResponse.json(
        { error: authResult.error || 'Access denied' },
        { status: authResult.status }
      );
    }

    const body = await req.json();
    const patchData: Record<string, any> = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    delete patchData.id;
    delete patchData.agent_id;
    delete patchData.created_at;

    const { data, error } = await dbClient
      .from('marketing_campaigns')
      .update(patchData)
      .eq('id', campaignId)
      .select()
      .single();

    if (error) {
      console.error(`PATCH /api/marketing/campaigns/${campaignId} error:`, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('PATCH /api/marketing/campaigns/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
