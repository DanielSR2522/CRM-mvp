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

    const sessionStatus = await adapter.validateSession(user.id);
    const nowIso = new Date().toISOString();

    await supabase
      .from('carrier_connections')
      .update({
        connection_status: sessionStatus,
        updated_at: nowIso,
      })
      .eq('agent_id', user.id)
      .eq('carrier', carrier.toLowerCase());

    return NextResponse.json({
      success: true,
      carrier,
      sessionStatus,
    });
  } catch (err: any) {
    console.error('Automation validate error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to validate carrier session.' },
      { status: 500 }
    );
  }
}
