import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeClientAccess } from '@/lib/integration/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ALLOWED_SOURCES = ['pc', 'health', 'life', 'medicare', 'supplemental'] as const;
type PolicySource = typeof ALLOWED_SOURCES[number];

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function maskPolicyNumber(policyNum: string | null | undefined): string {
  if (!policyNum) return '';
  const trimmed = policyNum.trim();
  if (trimmed.length <= 4) return '***' + trimmed;
  return '***' + trimmed.slice(-4);
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
    const {
      policyId,
      policySource,
      actorWinterfellProfileId,
      clientId,
      explicitPolicyNumber,
      policyQuery,
      carrier,
      lineType,
      isContextualRef,
    } = body;

    if (!actorWinterfellProfileId || !UUID_REGEX.test(actorWinterfellProfileId)) {
      return NextResponse.json({ error: 'Invalid or missing actorWinterfellProfileId.' }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();

    // Case 1: Policy lookup by direct policyId
    if (policyId && UUID_REGEX.test(policyId)) {
      let policyRecord: { id: string; client_id: string; carrier?: string; policy_number?: string } | null = null;
      const source = policySource || 'pc';

      if (source === 'pc') {
        const { data } = await adminDb
          .from('policies')
          .select('id, client_id, company_name, writing_company, policy_number')
          .eq('id', policyId)
          .maybeSingle();
        if (data) {
          policyRecord = {
            id: data.id,
            client_id: data.client_id,
            carrier: data.company_name || data.writing_company || '',
            policy_number: data.policy_number || '',
          };
        }
      } else if (source === 'health') {
        const { data } = await adminDb
          .from('health_policies')
          .select('id, client_id, company_2026, plan_name, application_number')
          .eq('id', policyId)
          .maybeSingle();
        if (data) {
          policyRecord = {
            id: data.id,
            client_id: data.client_id,
            carrier: data.company_2026 || data.plan_name || '',
            policy_number: data.application_number || '',
          };
        }
      } else if (source === 'life') {
        const { data } = await adminDb
          .from('life_policies')
          .select('id, client_id, carrier, policy_number')
          .eq('id', policyId)
          .maybeSingle();
        if (data) {
          policyRecord = {
            id: data.id,
            client_id: data.client_id,
            carrier: data.carrier || '',
            policy_number: data.policy_number || '',
          };
        }
      } else if (source === 'medicare') {
        const { data } = await adminDb
          .from('medicare_policies')
          .select('id, client_id, carrier, policy_number')
          .eq('id', policyId)
          .maybeSingle();
        if (data) {
          policyRecord = {
            id: data.id,
            client_id: data.client_id,
            carrier: data.carrier || '',
            policy_number: data.policy_number || '',
          };
        }
      } else if (source === 'supplemental') {
        const { data } = await adminDb
          .from('supplemental_policies')
          .select('id, client_id, carrier, policy_number')
          .eq('id', policyId)
          .maybeSingle();
        if (data) {
          policyRecord = {
            id: data.id,
            client_id: data.client_id,
            carrier: data.carrier || '',
            policy_number: data.policy_number || '',
          };
        }
      }

      if (!policyRecord) {
        return NextResponse.json({ success: true, status: 'not_found' });
      }

      const authResult = await authorizeClientAccess(adminDb, actorWinterfellProfileId, policyRecord.client_id);
      if (!authResult.authorized) {
        return NextResponse.json({ error: 'Actor is not authorized to access this policy.' }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        status: 'unique',
        policy: {
          id: policyRecord.id,
          carrier: policyRecord.carrier || '',
          policy_number_masked: maskPolicyNumber(policyRecord.policy_number),
          line_type: source,
          client_id: policyRecord.client_id,
        },
      });
    }

    // Case 2: Policy resolution by clientId
    if (clientId && UUID_REGEX.test(clientId)) {
      const authResult = await authorizeClientAccess(adminDb, actorWinterfellProfileId, clientId);
      if (!authResult.authorized) {
        return NextResponse.json({ error: 'Actor is not authorized to access this client policies.' }, { status: 403 });
      }

      const allClientPolicies: Array<{ id: string; client_id: string; carrier: string; policy_number_masked: string; line_type: string }> = [];

      // Query P&C
      const { data: pcRows } = await adminDb.from('policies').select('id, client_id, company_name, writing_company, policy_number').eq('client_id', clientId);
      (pcRows || []).forEach(p => {
        allClientPolicies.push({
          id: p.id,
          client_id: p.client_id,
          carrier: p.company_name || p.writing_company || 'P&C',
          policy_number_masked: maskPolicyNumber(p.policy_number),
          line_type: 'P&C',
        });
      });

      // Query Health
      const { data: healthRows } = await adminDb.from('health_policies').select('id, client_id, company_2026, plan_name, application_number').eq('client_id', clientId);
      (healthRows || []).forEach(p => {
        allClientPolicies.push({
          id: p.id,
          client_id: p.client_id,
          carrier: p.company_2026 || p.plan_name || 'Health',
          policy_number_masked: maskPolicyNumber(p.application_number),
          line_type: 'Health',
        });
      });

      // Query Life
      const { data: lifeRows } = await adminDb.from('life_policies').select('id, client_id, carrier, policy_number').eq('client_id', clientId);
      (lifeRows || []).forEach(p => {
        allClientPolicies.push({
          id: p.id,
          client_id: p.client_id,
          carrier: p.carrier || 'Life',
          policy_number_masked: maskPolicyNumber(p.policy_number),
          line_type: 'Life',
        });
      });

      // Query Medicare
      const { data: medicareRows } = await adminDb.from('medicare_policies').select('id, client_id, carrier, policy_number').eq('client_id', clientId);
      (medicareRows || []).forEach(p => {
        allClientPolicies.push({
          id: p.id,
          client_id: p.client_id,
          carrier: p.carrier || 'Medicare',
          policy_number_masked: maskPolicyNumber(p.policy_number),
          line_type: 'Medicare',
        });
      });

      // Query Supplemental
      const { data: suppRows } = await adminDb.from('supplemental_policies').select('id, client_id, carrier, policy_number').eq('client_id', clientId);
      (suppRows || []).forEach(p => {
        allClientPolicies.push({
          id: p.id,
          client_id: p.client_id,
          carrier: p.carrier || 'Supplemental',
          policy_number_masked: maskPolicyNumber(p.policy_number),
          line_type: 'Supplemental',
        });
      });

      if (allClientPolicies.length === 0) {
        return NextResponse.json({ success: true, status: 'not_found' });
      }

      if (explicitPolicyNumber) {
        const normNum = normalizeString(explicitPolicyNumber);
        const match = allClientPolicies.find(p => normalizeString(p.policy_number_masked).includes(normNum));
        if (match) return NextResponse.json({ success: true, status: 'unique', policy: match });
        return NextResponse.json({ success: true, status: 'not_found' });
      }

      const combinedQuery = `${policyQuery || ''} ${carrier || ''} ${lineType || ''}`.trim();
      if (!combinedQuery) {
        if (allClientPolicies.length === 1) {
          return NextResponse.json({ success: true, status: 'unique', policy: allClientPolicies[0] });
        }
        return NextResponse.json({ success: true, status: 'not_found' });
      }

      const normQ = normalizeString(combinedQuery);
      const matches = allClientPolicies.filter(p => {
        const normCarrier = normalizeString(p.carrier);
        const normLine = normalizeString(p.line_type);
        const normNumber = normalizeString(p.policy_number_masked);
        return (
          normQ.includes(normCarrier) ||
          normCarrier.includes(normQ) ||
          normQ.includes(normLine) ||
          normLine.includes(normQ) ||
          (normNumber && normQ.includes(normNumber.replace(/\D/g, '')))
        );
      });

      if (matches.length === 1) {
        return NextResponse.json({ success: true, status: 'unique', policy: matches[0] });
      }
      if (matches.length > 1) {
        return NextResponse.json({ success: true, status: 'ambiguous', matches });
      }

      return NextResponse.json({ success: true, status: 'not_found' });
    }

    return NextResponse.json({ error: 'Invalid or missing policyId or clientId.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
