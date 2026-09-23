import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_LANGUAGES = ['es', 'en', 'pt'] as const;

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: Request) {
  try {
    const integrationSecret = process.env.WINTERFELL_INTEGRATION_SECRET;
    const authHeader = request.headers.get('x-winterfell-integration-secret') || '';

    if (!integrationSecret || !authHeader || !safeCompare(authHeader, integrationSecret)) {
      return NextResponse.json({ error: 'Unauthorized integration request.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();

    // 1. Query canonical Agent profiles (role = 'agent') including preferred_language
    const { data: agentProfiles, error: pErr } = await adminDb
      .from('profiles')
      .select('id, name, first_name, last_name, email, role, whatsapp_phone, preferred_language')
      .eq('role', 'agent');

    if (pErr) {
      return NextResponse.json({ error: `Failed to fetch agent profiles: ${pErr.message}` }, { status: 500 });
    }

    const agentIds = (agentProfiles || []).map((p: any) => p.id);

    // 2. Query active agent_assistant_relationships for these agents
    let relationships: Array<{ agent_profile_id: string; assistant_profile_id: string }> = [];
    if (agentIds.length > 0) {
      const { data: rels, error: rErr } = await adminDb
        .from('agent_assistant_relationships')
        .select('agent_profile_id, assistant_profile_id')
        .in('agent_profile_id', agentIds);

      if (!rErr && rels) {
        relationships = rels;
      }
    }

    // 3. Map linked assistantProfileIds and preferredLanguage to each agent
    const agents = (agentProfiles || []).map((p: any) => {
      const fn = p.first_name || '';
      const ln = p.last_name || '';
      const name = `${fn} ${ln}`.trim() || p.name || p.email?.split('@')[0] || 'Agente';
      const assistantProfileIds = relationships
        .filter((r) => r.agent_profile_id === p.id)
        .map((r) => r.assistant_profile_id);

      const rawLang = p.preferred_language?.toLowerCase();
      const preferredLanguage = VALID_LANGUAGES.includes(rawLang as any) ? rawLang : 'es';

      return {
        winterfellProfileId: p.id,
        name,
        email: p.email || '',
        role: p.role,
        whatsappPhone: p.whatsapp_phone || null,
        preferredLanguage,
        assistantProfileIds,
      };
    });

    return NextResponse.json({
      success: true,
      agents,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
