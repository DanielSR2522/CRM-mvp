import { NextResponse, type NextRequest } from 'next/server';
import { saveDevSession, getDevSession, DevRenewalSession } from '@/lib/renewals/dev-session-store';
import { getLoniRenewalHealthClients, LONI_PROFILE_ID } from '@/lib/renewals/loni-clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }

  try {
    const body: DevRenewalSession = await req.json();

    if (!body || !body.client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    // Reject if client_id matches Loni's profile ID
    if (body.client_id === LONI_PROFILE_ID) {
      return NextResponse.json(
        { error: 'Invalid client_id: d1c696ef-c77d-4b2b-a3f5-83acd965c363 is an agent profile ID, not a public.clients.id.' },
        { status: 400 }
      );
    }

    // Validate client using shared single source of truth helper
    const { clients } = await getLoniRenewalHealthClients();
    const validClient = clients.find((c) => c.client_id === body.client_id || c.id === body.client_id);

    if (!validClient) {
      console.warn(`[Winterfell Dev Session] Validation failed for client_id: ${body.client_id}`);
      return NextResponse.json(
        { error: `Invalid client_id (${body.client_id}): client does not exist or has no active Health policy assigned to Loni.` },
        { status: 400 }
      );
    }

    // Save session in local in-memory store (NO DB WRITE)
    saveDevSession(body);
    console.log(`[Winterfell Dev Session] Successfully stored local session for client_id: ${body.client_id}`);
    return NextResponse.json({ success: true, client_id: body.client_id });
  } catch (err: any) {
    console.error('[Winterfell Dev Renewal Session API Error]:', err);
    return NextResponse.json({ error: err?.message || 'Failed to save session' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json({ error: 'clientId query parameter is required' }, { status: 400 });
  }

  const session = getDevSession(clientId);
  return NextResponse.json({ session: session || null });
}
