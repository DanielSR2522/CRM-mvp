import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const body = await request.json();
    const { carrier = 'oscar', enabled, sync_interval_hours = 8 } = body;

    const nowTime = Date.now();
    const intervalMs = sync_interval_hours * 60 * 60 * 1000;
    const nextSyncAt = enabled ? new Date(nowTime + intervalMs).toISOString() : null;
    const nowIso = new Date(nowTime).toISOString();

    const { data: connection, error: connErr } = await supabase
      .from('carrier_connections')
      .upsert(
        {
          agent_id: user.id,
          carrier,
          automation_enabled: Boolean(enabled),
          sync_interval_hours: Number(sync_interval_hours),
          next_sync_at: nextSyncAt,
          updated_at: nowIso,
        },
        { onConflict: 'agent_id,carrier' }
      )
      .select()
      .single();

    if (connErr) {
      throw connErr;
    }

    return NextResponse.json({
      success: true,
      connection,
    });
  } catch (err: any) {
    console.error('Error toggling automation:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to toggle automation settings.' },
      { status: 500 }
    );
  }
}
