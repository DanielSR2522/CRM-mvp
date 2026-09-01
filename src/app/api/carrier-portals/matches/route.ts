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
    const { external_member_id, client_id, action, carrier = 'oscar' } = body;

    if (!external_member_id) {
      return NextResponse.json({ error: 'external_member_id is required.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    let matchStatus = 'matched';
    let targetClientId = client_id || null;
    let matchMethod = 'manual';

    if (action === 'confirm' || action === 'manual') {
      if (!client_id) {
        return NextResponse.json({ error: 'client_id is required for confirming match.' }, { status: 400 });
      }
      matchStatus = 'matched';
      matchMethod = 'manual_confirmed';
    } else if (action === 'ignore') {
      matchStatus = 'ignored';
      targetClientId = null;
      matchMethod = 'manual_ignored';
    } else if (action === 'unmatch') {
      matchStatus = 'unmatched';
      targetClientId = null;
      matchMethod = 'manual_unmatched';
    }

    // Upsert into carrier_client_matches
    const { data: updatedMatch, error: matchErr } = await supabase
      .from('carrier_client_matches')
      .upsert(
        {
          agent_id: user.id,
          carrier,
          external_member_id,
          client_id: targetClientId,
          match_status: matchStatus,
          confidence_score: 100,
          match_method: matchMethod,
          confirmed_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'agent_id,carrier,external_member_id' }
      )
      .select('*, client:clients(id, full_name, email, phone)')
      .single();

    if (matchErr) {
      throw matchErr;
    }

    // Also update current carrier_policy_snapshots with client_id if available
    await supabase
      .from('carrier_policy_snapshots')
      .update({ client_id: targetClientId })
      .eq('agent_id', user.id)
      .eq('carrier', carrier)
      .eq('external_member_id', external_member_id);

    return NextResponse.json({
      success: true,
      match: updatedMatch,
    });
  } catch (err: any) {
    console.error('Error updating match:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update client match.' },
      { status: 500 }
    );
  }
}
