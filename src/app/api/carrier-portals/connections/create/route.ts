import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getCarrierDefinition } from '@/lib/carrier-portals/carrier-registry';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { carrier } = body;

    if (!carrier || typeof carrier !== 'string') {
      return NextResponse.json({ error: 'Missing required parameter: carrier' }, { status: 400 });
    }

    const carrierDef = getCarrierDefinition(carrier);
    if (!carrierDef) {
      return NextResponse.json({ error: `Unsupported carrier: '${carrier}'` }, { status: 400 });
    }

    const canonicalCarrier = carrierDef.id;

    // Check duplicate connection for (agent_id + carrier)
    const { data: existing, error: findErr } = await supabase
      .from('carrier_connections')
      .select('*')
      .eq('agent_id', user.id)
      .eq('carrier', canonicalCarrier)
      .maybeSingle();

    if (findErr) {
      console.error('Error querying existing carrier connection:', findErr);
    }

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        connection: existing,
        message: `${carrierDef.displayName} connection already exists.`,
      });
    }

    // Create new carrier connection
    const nowIso = new Date().toISOString();
    const { data: newConn, error: insertErr } = await supabase
      .from('carrier_connections')
      .insert({
        agent_id: user.id,
        carrier: canonicalCarrier,
        connection_status: 'not_connected',
        sync_source: 'automated_portal',
        automation_enabled: false,
        sync_interval_hours: 8,
        timezone: 'America/New_York',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Error inserting carrier connection:', insertErr);
      return NextResponse.json({ error: insertErr.message || 'Failed to create carrier connection.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alreadyExists: false,
      connection: newConn,
      message: `${carrierDef.displayName} connection created successfully!`,
    });
  } catch (err: any) {
    console.error('Error in create carrier connection API:', err);
    return NextResponse.json({ error: err?.message || 'Server error creating carrier connection.' }, { status: 500 });
  }
}
