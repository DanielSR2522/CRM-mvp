import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeClientAccess } from '@/lib/integration/authorization';
import { AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';
import type { PolicySource } from '@/components/tickets/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function maskNumber(num: string | null | undefined): string {
  if (!num) return '***';
  const trimmed = num.trim();
  if (trimmed.length <= 4) return '***' + trimmed;
  return '***' + trimmed.slice(-4);
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Winterfell session required.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const clientIdParam = searchParams.get('clientId');
    const queryParam = searchParams.get('q') || '';

    // Action B: Fetch Client Policies
    if (clientIdParam) {
      if (!UUID_REGEX.test(clientIdParam)) {
        return NextResponse.json({ error: 'Invalid clientId format.' }, { status: 400 });
      }

      // Authorize client access (admin, assigned agent, or shared agent)
      const authResult = await authorizeClientAccess(adminDb, user.id, clientIdParam);
      if (!authResult.authorized) {
        return NextResponse.json({ error: 'Unauthorized to access this client.' }, { status: 403 });
      }

      const normalizedPolicies: Array<{ id: string; source: PolicySource; displayLabel: string }> = [];

      // 1. P&C Policies
      const { data: pcRows } = await adminDb
        .from('policies')
        .select('id, company_name, writing_company, policy_number')
        .eq('client_id', clientIdParam);
      (pcRows || []).forEach((p) => {
        const carrier = p.company_name || p.writing_company || 'P&C';
        normalizedPolicies.push({
          id: p.id,
          source: 'pc',
          displayLabel: `P&C - ${carrier} (${maskNumber(p.policy_number)})`,
        });
      });

      // 2. Health Policies
      const { data: healthRows } = await adminDb
        .from('health_policies')
        .select('id, company_2026, plan_name, application_number')
        .eq('client_id', clientIdParam);
      (healthRows || []).forEach((h) => {
        const carrier = h.company_2026 || h.plan_name || 'Salud';
        normalizedPolicies.push({
          id: h.id,
          source: 'health',
          displayLabel: `Salud - ${carrier} (${maskNumber(h.application_number)})`,
        });
      });

      // 3. Life Policies
      const { data: lifeRows } = await adminDb
        .from('life_policies')
        .select('id, policy_number, status')
        .eq('client_id', clientIdParam);
      (lifeRows || []).forEach((l) => {
        normalizedPolicies.push({
          id: l.id,
          source: 'life',
          displayLabel: `Vida (${maskNumber(l.policy_number)})`,
        });
      });

      // 4. Medicare Policies
      const { data: medicareRows } = await adminDb
        .from('medicare_policies')
        .select('id, carrier, policy_number, plan_name')
        .eq('client_id', clientIdParam);
      (medicareRows || []).forEach((m) => {
        const carrier = m.carrier || m.plan_name || 'Medicare';
        normalizedPolicies.push({
          id: m.id,
          source: 'medicare',
          displayLabel: `Medicare - ${carrier} (${maskNumber(m.policy_number)})`,
        });
      });

      // 5. Supplemental Policies
      const { data: suppRows } = await adminDb
        .from('supplemental_policies')
        .select('id, carrier, policy_number')
        .eq('client_id', clientIdParam);
      (suppRows || []).forEach((s) => {
        const carrier = s.carrier || 'Suplementario';
        normalizedPolicies.push({
          id: s.id,
          source: 'supplemental',
          displayLabel: `Suplementario - ${carrier} (${maskNumber(s.policy_number)})`,
        });
      });

      return NextResponse.json({
        success: true,
        clientId: clientIdParam,
        policies: normalizedPolicies,
      });
    }

    // Action A: Search Authorized Clients
    const isAdmin = user.id === AMANDA_UUID || user.id === LAURA_UUID;
    let profileRole: string | null = null;

    if (!isAdmin) {
      const { data: profile } = await adminDb
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && (profile as any).role === 'admin') {
        profileRole = 'admin';
      }
    }

    const effectiveIsAdmin = isAdmin || profileRole === 'admin';

    // Shared agent access resolution
    const allowedAgentIds = new Set<string>([user.id]);
    if (!effectiveIsAdmin) {
      const { data: sharedRows } = await adminDb
        .from('agent_shared_access')
        .select('agent_id, shared_agent_id')
        .or(`agent_id.eq.${user.id},shared_agent_id.eq.${user.id}`);

      (sharedRows || []).forEach((row) => {
        if (row.agent_id === user.id && row.shared_agent_id) allowedAgentIds.add(row.shared_agent_id);
        if (row.shared_agent_id === user.id && row.agent_id) allowedAgentIds.add(row.agent_id);
      });
    }

    let clientsQuery = adminDb
      .from('clients')
      .select('id, full_name, address, phone, agent_id, client_type')
      .order('full_name', { ascending: true })
      .limit(50);

    if (queryParam.trim() !== '') {
      clientsQuery = clientsQuery.ilike('full_name', `%${queryParam.trim()}%`);
    }

    const { data: rawClients, error: clientsErr } = await clientsQuery;

    if (clientsErr) {
      return NextResponse.json({ error: 'Failed to query clients.' }, { status: 500 });
    }

    // Filter by canonical authorization scope
    const authorizedClients = (rawClients || []).filter((c) => {
      if (effectiveIsAdmin) return true;
      if (!c.agent_id) return false;
      return allowedAgentIds.has(c.agent_id);
    });

    // Return DTO with non-sensitive fields ONLY
    const clientOptions = authorizedClients.map((c) => ({
      id: c.id,
      name: c.full_name ? c.full_name.trim() : 'Sin Nombre',
      city: c.address ? c.address.trim() : null,
      phoneLast4: c.phone ? c.phone.trim().slice(-4) : null,
      clientType: c.client_type || 'personal',
    }));

    return NextResponse.json({
      success: true,
      clients: clientOptions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
