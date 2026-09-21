import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeClientAccess } from '@/lib/integration/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (!user) return `@${domain}`;
  const visible = user.charAt(0);
  return `${visible}***@${domain}`;
}

export async function POST(request: Request) {
  try {
    const integrationSecret = process.env.WINTERFELL_INTEGRATION_SECRET;
    const authHeader = request.headers.get('x-winterfell-integration-secret') || '';

    if (!integrationSecret || !authHeader || !safeCompare(authHeader, integrationSecret)) {
      return NextResponse.json({ error: 'Unauthorized integration request.' }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, actorWinterfellProfileId } = body;

    if (!clientId || !UUID_REGEX.test(clientId)) {
      return NextResponse.json({ error: 'Invalid or missing clientId.' }, { status: 400 });
    }
    if (!actorWinterfellProfileId || !UUID_REGEX.test(actorWinterfellProfileId)) {
      return NextResponse.json({ error: 'Invalid or missing actorWinterfellProfileId.' }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();

    const authResult = await authorizeClientAccess(adminDb, actorWinterfellProfileId, clientId);

    if (!authResult.authorized || !authResult.client) {
      if (authResult.reason === 'client_not_found') {
        return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Actor is not authorized to access this client.' }, { status: 403 });
    }

    const client = authResult.client;
    const phoneLast4 = client.phone ? client.phone.trim().slice(-4) : '';

    return NextResponse.json({
      success: true,
      client: {
        id: client.id,
        name: client.full_name ? client.full_name.trim() : '',
        phone_last4: phoneLast4,
        email_masked: maskEmail(client.email),
        city: client.city ? client.city.trim() : '',
        assigned_agent_ids: client.agent_id ? [client.agent_id] : [],
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
