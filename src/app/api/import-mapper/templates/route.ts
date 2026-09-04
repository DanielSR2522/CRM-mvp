import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertCanAccessAgent, createCookieSupabase, requireImportUser } from '@/lib/import-mapper/auth';
import { ColumnMapping } from '@/lib/import-mapper/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = createCookieSupabase(await cookies());
    await requireImportUser(supabase);
    const agentId = new URL(request.url).searchParams.get('agentId');
    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required.' }, { status: 400 });
    }
    await assertCanAccessAgent(supabase, agentId);

    const { data, error } = await supabase
      .from('import_mapping_templates')
      .select('id, agent_id, name, source_fingerprint, mapping, updated_at')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load templates.';
    const status = message.includes('Unauthorized') ? 401 : message.includes('access') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createCookieSupabase(await cookies());
    const user = await requireImportUser(supabase);
    const body = (await request.json()) as {
      agentId?: string;
      name?: string;
      sourceFingerprint?: string;
      mapping?: ColumnMapping;
    };

    if (!body.agentId || !body.name?.trim() || !body.mapping) {
      return NextResponse.json({ error: 'agentId, name, and mapping are required.' }, { status: 400 });
    }
    await assertCanAccessAgent(supabase, body.agentId);

    const { data, error } = await supabase
      .from('import_mapping_templates')
      .upsert({
        agent_id: body.agentId,
        name: body.name.trim(),
        source_fingerprint: body.sourceFingerprint || null,
        mapping: body.mapping,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,name' })
      .select('id, agent_id, name, source_fingerprint, mapping, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save template.';
    const status = message.includes('Unauthorized') ? 401 : message.includes('access') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
