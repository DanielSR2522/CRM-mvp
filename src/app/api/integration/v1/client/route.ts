import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeClientAccess } from '@/lib/integration/authorization';
import { AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';

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

function normalizeString(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export async function POST(request: Request) {
  try {
    const integrationSecret = process.env.WINTERFELL_INTEGRATION_SECRET;
    const authHeader = request.headers.get('x-winterfell-integration-secret') || '';

    if (!integrationSecret || !authHeader || !safeCompare(authHeader, integrationSecret)) {
      return NextResponse.json({ error: 'Unauthorized integration request.' }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, clientQuery, actorWinterfellProfileId, currentClientId, isContextualRef } = body;

    if (!actorWinterfellProfileId || !UUID_REGEX.test(actorWinterfellProfileId)) {
      return NextResponse.json({ error: 'Invalid or missing actorWinterfellProfileId.' }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();

    // 1. Explicit ID lookup
    const targetId = clientId || (isContextualRef && currentClientId ? currentClientId : null);
    if (targetId && UUID_REGEX.test(targetId)) {
      const authResult = await authorizeClientAccess(adminDb, actorWinterfellProfileId, targetId);

      if (!authResult.authorized || !authResult.client) {
        if (authResult.reason === 'client_not_found') {
          return NextResponse.json({ success: true, status: 'not_found' });
        }
        return NextResponse.json({ error: 'Actor is not authorized to access this client.' }, { status: 403 });
      }

      const client = authResult.client;
      const phoneLast4 = client.phone ? client.phone.trim().slice(-4) : '';

      return NextResponse.json({
        success: true,
        status: 'unique',
        client: {
          id: client.id,
          name: client.full_name ? client.full_name.trim() : '',
          phone_last4: phoneLast4,
          email_masked: maskEmail(client.email),
          city: client.address ? client.address.trim() : (client.city || ''),
          assigned_agent_ids: client.agent_id ? [client.agent_id] : [],
        },
      });
    }

    // 2. Query by Client Name
    const isOwner = actorWinterfellProfileId === AMANDA_UUID || actorWinterfellProfileId === LAURA_UUID;
    const { data: profile } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', actorWinterfellProfileId)
      .maybeSingle();

    const isAdmin = isOwner || profile?.role === 'admin';

    let dbQuery = adminDb.from('clients').select('id, full_name, email, phone, address, agent_id');

    if (!isAdmin) {
      const { data: sharedRows } = await adminDb
        .from('agent_shared_access')
        .select('agent_id, shared_agent_id')
        .or(`agent_id.eq.${actorWinterfellProfileId},shared_agent_id.eq.${actorWinterfellProfileId}`);

      const sharedAgentIds = (sharedRows || [])
        .map((r) => (r.agent_id === actorWinterfellProfileId ? r.shared_agent_id : r.agent_id))
        .filter(Boolean);

      const { data: assistantRows } = await adminDb
        .from('agent_assistant_relationships')
        .select('agent_profile_id')
        .eq('assistant_profile_id', actorWinterfellProfileId);

      const assistantAgentIds = (assistantRows || []).map((r) => r.agent_profile_id).filter(Boolean);

      const allowedAgentIds = Array.from(new Set([actorWinterfellProfileId, ...sharedAgentIds, ...assistantAgentIds]));
      dbQuery = dbQuery.in('agent_id', allowedAgentIds);
    }

    const { data: clientsData, error: queryErr } = await dbQuery;
    if (queryErr || !clientsData) {
      return NextResponse.json({ success: true, status: 'not_found' });
    }

    const rawQuery = clientQuery ? String(clientQuery).trim() : '';
    if (!rawQuery) {
      return NextResponse.json({ success: true, status: 'not_found' });
    }

    const normQ = normalizeString(rawQuery);
    const matches = clientsData
      .filter((c) => {
        const normName = c.full_name ? normalizeString(c.full_name) : '';
        return normName === normQ || normName.includes(normQ) || normQ.includes(normName);
      })
      .map((c) => ({
        id: c.id,
        name: c.full_name ? c.full_name.trim() : '',
        phone_last4: c.phone ? c.phone.trim().slice(-4) : '',
        email_masked: maskEmail(c.email),
        city: c.address ? c.address.trim() : '',
        assigned_agent_ids: c.agent_id ? [c.agent_id] : [],
      }));

    if (matches.length === 1) {
      return NextResponse.json({ success: true, status: 'unique', client: matches[0] });
    }
    if (matches.length > 1) {
      return NextResponse.json({ success: true, status: 'ambiguous', matches });
    }

    return NextResponse.json({ success: true, status: 'not_found' });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
