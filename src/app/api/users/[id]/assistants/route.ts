import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getActorRole } from '@/app/api/users/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const resolvedParams = await params;
    const targetUserId = resolvedParams.id;
    const adminDb = getSupabaseAdmin();

    // 1. Fetch assistants for target user (if target is an Agent)
    const { data: assistantRels } = await adminDb
      .from('agent_assistant_relationships')
      .select('assistant_profile_id, created_at')
      .eq('agent_profile_id', targetUserId);

    const assistantIds = (assistantRels || []).map((r) => r.assistant_profile_id);
    let assistants: any[] = [];
    if (assistantIds.length > 0) {
      const { data: assistantProfiles } = await adminDb
        .from('profiles')
        .select('id, name, first_name, last_name, email, role')
        .in('id', assistantIds);

      assistants = (assistantProfiles || []).map((p) => {
        const fn = p.first_name || '';
        const ln = p.last_name || '';
        const name = `${fn} ${ln}`.trim() || p.name || p.email?.split('@')[0] || 'Asistente';
        return {
          id: p.id,
          name,
          email: p.email,
          role: p.role || 'assistant',
        };
      });
    }

    // 2. Fetch agents this target user assists (if target is an Assistant)
    const { data: agentRels } = await adminDb
      .from('agent_assistant_relationships')
      .select('agent_profile_id, created_at')
      .eq('assistant_profile_id', targetUserId);

    const agentIds = (agentRels || []).map((r) => r.agent_profile_id);
    let assists: any[] = [];
    if (agentIds.length > 0) {
      const { data: agentProfiles } = await adminDb
        .from('profiles')
        .select('id, name, first_name, last_name, email, role')
        .in('id', agentIds);

      assists = (agentProfiles || []).map((p) => {
        const fn = p.first_name || '';
        const ln = p.last_name || '';
        const name = `${fn} ${ln}`.trim() || p.name || p.email?.split('@')[0] || 'Agente';
        return {
          id: p.id,
          name,
          email: p.email,
          role: p.role || 'agent',
        };
      });
    }

    return NextResponse.json({
      success: true,
      assistants,
      assists,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { data: actorProfile } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const actorRole = getActorRole(user.id, actorProfile?.role);

    if (actorRole === 'assistant') {
      return NextResponse.json({ error: 'Forbidden: Assistants cannot manage relationships.' }, { status: 403 });
    }

    const resolvedParams = await params;
    const targetUserId = resolvedParams.id;

    if (actorRole === 'agent' && targetUserId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: No tienes permiso para gestionar asistentes de otros agentes.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const assistantProfileId = body.assistantProfileId || body.assistantId;

    if (!assistantProfileId || typeof assistantProfileId !== 'string') {
      return NextResponse.json({ error: 'assistantProfileId is required.' }, { status: 400 });
    }

    // Server-side check for max 4 assistants limit
    const { count, error: countErr } = await adminDb
      .from('agent_assistant_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('agent_profile_id', targetUserId);

    if (countErr) {
      return NextResponse.json({ error: `Failed to check assistant count: ${countErr.message}` }, { status: 500 });
    }

    if (count !== null && count >= 4) {
      return NextResponse.json({ error: 'Has alcanzado el máximo de 4 asistentes permitidos.' }, { status: 400 });
    }

    // Verify both target agent and assistant exist
    const { data: targetAgent } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', targetUserId)
      .maybeSingle();

    const { data: targetAssistant } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', assistantProfileId)
      .maybeSingle();

    if (!targetAgent || !targetAssistant) {
      return NextResponse.json({ error: 'Agent or Assistant profile not found.' }, { status: 404 });
    }

    // Insert relationship idempotently
    const { error: insertErr } = await adminDb
      .from('agent_assistant_relationships')
      .insert({
        agent_profile_id: targetUserId,
        assistant_profile_id: assistantProfileId,
        created_by: user.id,
      });

    if (insertErr) {
      const isMaxError = insertErr.message?.includes('máximo') || insertErr.message?.includes('4');
      const errorMsg = isMaxError
        ? 'Has alcanzado el máximo de 4 asistentes permitidos.'
        : `Failed to add relationship: ${insertErr.message}`;
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Assistant linked successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { data: actorProfile } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const actorRole = getActorRole(user.id, actorProfile?.role);

    if (actorRole === 'assistant') {
      return NextResponse.json({ error: 'Forbidden: Assistants cannot manage relationships.' }, { status: 403 });
    }

    const resolvedParams = await params;
    const targetUserId = resolvedParams.id;

    if (actorRole === 'agent' && targetUserId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: No tienes permiso para gestionar asistentes de otros agentes.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    let assistantProfileId = searchParams.get('assistantProfileId') || searchParams.get('assistantId');

    if (!assistantProfileId) {
      const body = await request.json().catch(() => ({}));
      assistantProfileId = body.assistantProfileId || body.assistantId;
    }

    if (!assistantProfileId || typeof assistantProfileId !== 'string') {
      return NextResponse.json({ error: 'assistantProfileId is required.' }, { status: 400 });
    }

    const { error: deleteErr } = await adminDb
      .from('agent_assistant_relationships')
      .delete()
      .eq('agent_profile_id', targetUserId)
      .eq('assistant_profile_id', assistantProfileId);

    if (deleteErr) {
      return NextResponse.json({ error: `Failed to remove relationship: ${deleteErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Assistant relationship removed successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
