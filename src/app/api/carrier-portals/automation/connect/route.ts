import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { adapterRegistry } from '@/lib/carrier-portals/automation/adapter-registry';

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

    const body = await request.json().catch(() => ({}));
    const carrier = body.carrier || 'oscar';

    const adapter = adapterRegistry.getAdapter(carrier);
    if (!adapter) {
      return NextResponse.json({ error: `No carrier automation adapter registered for '${carrier}'.` }, { status: 400 });
    }

    // Trigger headed interactive Playwright login
    const result = await adapter.startInteractiveLogin(user.id);

    const nowIso = new Date().toISOString();
    await supabase
      .from('carrier_connections')
      .upsert(
        {
          agent_id: user.id,
          carrier: carrier.toLowerCase(),
          connection_status: 'connected',
          sync_source: 'automated_portal',
          automation_enabled: true,
          last_success_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        },
        { onConflict: 'agent_id,carrier' }
      );

    return NextResponse.json({
      success: true,
      carrier,
      message: `${carrier} portal session connected and saved locally.`,
      result,
    });
  } catch (err: any) {
    console.error('Automation connect error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to complete interactive carrier login.' },
      { status: 500 }
    );
  }
}
