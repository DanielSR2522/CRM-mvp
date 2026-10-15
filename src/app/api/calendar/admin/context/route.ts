import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';
import {
  LONI_CRM_AGENT_ID,
  LONI_CRM_AGENT_EMAIL,
  logCalendarAuditAction,
} from '@/lib/calendar/calendly-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { data: actorProfile } = await adminDb
      .from('profiles')
      .select('id, email, name, first_name, last_name, role')
      .eq('id', user.id)
      .maybeSingle();

    const actorRole = (actorProfile?.role || '').toLowerCase();
    const isAdmin = user.id === AMANDA_UUID || user.id === LAURA_UUID || actorRole === 'admin';

    const actorName = actorProfile
      ? `${actorProfile.first_name || ''} ${actorProfile.last_name || ''}`.trim() || actorProfile.name || user.email || 'User'
      : (user.email?.split('@')[0] || 'User');

    if (!isAdmin) {
      return NextResponse.json({
        currentUserId: user.id,
        currentUserEmail: user.email,
        currentUserName: actorName,
        isAdmin: false,
        targetAgent: null,
        availableAgents: [],
      });
    }

    // Fetch Loni's verified profile
    const { data: loniProfile } = await adminDb
      .from('profiles')
      .select('id, email, name, first_name, last_name, role')
      .eq('id', LONI_CRM_AGENT_ID)
      .maybeSingle();

    const targetAgent = {
      id: LONI_CRM_AGENT_ID,
      email: loniProfile?.email || LONI_CRM_AGENT_EMAIL,
      name: loniProfile
        ? `${loniProfile.first_name || ''} ${loniProfile.last_name || ''}`.trim() || loniProfile.name || 'Loni Oliveira De Souza'
        : 'Loni Oliveira De Souza',
      role: 'agent',
    };

    // Fetch list of active agents for admin viewing
    const { data: agentProfiles } = await adminDb
      .from('profiles')
      .select('id, email, name, first_name, last_name, role')
      .eq('role', 'agent')
      .order('name', { ascending: true });

    const availableAgents = (agentProfiles || []).map((p) => ({
      id: p.id,
      email: p.email,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.name || p.email,
      role: p.role,
    }));

    // Audit log read-only admin context check
    logCalendarAuditAction({
      action: 'VIEW_CALENDAR',
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      targetAgentId: targetAgent.id,
      targetAgentName: targetAgent.name,
      details: { context: 'admin_context_check' },
    });

    return NextResponse.json({
      currentUserId: user.id,
      currentUserEmail: user.email,
      currentUserName: actorName,
      isAdmin: true,
      targetAgent,
      availableAgents,
    });
  } catch (err: any) {
    console.error('[API /api/calendar/admin/context Error]:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to resolve calendar admin context.' },
      { status: 500 }
    );
  }
}
