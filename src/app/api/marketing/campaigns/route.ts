import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent, getAuthorizedAgentIds } from '@/lib/marketing/auth-guard';
import { MarketingCampaign } from '@/types/marketing';

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    if (!authUser?.agentId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Server-side agent authentication required.' },
        { status: 401 }
      );
    }

    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;
    const authorizedAgentIds = await getAuthorizedAgentIds(req, dbClient);

    const { data, error } = await dbClient
      .from('marketing_campaigns')
      .select('*')
      .in('agent_id', authorizedAgentIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('GET /api/marketing/campaigns error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    if (!authUser?.agentId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Server-side agent authentication required.' },
        { status: 401 }
      );
    }

    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;
    const body = await req.json();

    const targetId = body.id || randomUUID();
    const campToSave: Partial<MarketingCampaign> & { agent_id: string } = {
      id: targetId,
      agent_id: authUser.agentId,
      name: body.name || 'Untitled Campaign',
      channel: body.channel || 'EMAIL',
      subject: body.subject || '',
      preview_text: body.preview_text || '',
      from_name: body.from_name || 'Agent',
      from_email: body.from_email || 'consents@mail.smartrackcrm.com',
      reply_to: body.reply_to || body.from_email || 'agent@smartrack.com',
      segment_id: body.segment_id || null,
      template_id: body.template_id || null,
      content_html: body.content_html || '',
      content_text: body.content_text || '',
      scheduled_at: body.scheduled_at || null,
      sent_at: body.sent_at || null,
      status: body.status || 'DRAFT',
      total_matched: body.total_matched || 0,
      valid_recipients: body.valid_recipients || 0,
      excluded_duplicates: body.excluded_duplicates || 0,
      excluded_invalid_email: body.excluded_invalid_email || 0,
      excluded_unsubscribed: body.excluded_unsubscribed || 0,
      excluded_bounced: body.excluded_bounced || 0,
      updated_at: new Date().toISOString(),
    };

    if (body.created_at) {
      campToSave.created_at = body.created_at;
    }

    const { data, error } = await dbClient
      .from('marketing_campaigns')
      .upsert([campToSave])
      .select()
      .single();

    if (error) {
      console.error('Campaign server upsert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('POST /api/marketing/campaigns error:', err);
    return NextResponse.json({ error: err?.message || 'Server error creating campaign' }, { status: 500 });
  }
}
