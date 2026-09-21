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

export async function POST(request: Request) {
  try {
    const integrationSecret = process.env.WINTERFELL_INTEGRATION_SECRET;
    const authHeader = request.headers.get('x-winterfell-integration-secret') || '';

    if (!integrationSecret || !authHeader || !safeCompare(authHeader, integrationSecret)) {
      return NextResponse.json({ error: 'Unauthorized integration request.' }, { status: 401 });
    }

    const body = await request.json();
    const { policyId, policySource, actorWinterfellProfileId } = body;

    if (!policyId || !UUID_REGEX.test(policyId)) {
      return NextResponse.json({ error: 'Invalid or missing policyId.' }, { status: 400 });
    }
    if (!policySource || !ALLOWED_SOURCES.includes(policySource as PolicySource)) {
      return NextResponse.json({ error: 'Invalid or missing policySource.' }, { status: 400 });
    }
    if (!actorWinterfellProfileId || !UUID_REGEX.test(actorWinterfellProfileId)) {
      return NextResponse.json({ error: 'Invalid or missing actorWinterfellProfileId.' }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();

    let policyRecord: { id: string; client_id: string; carrier?: string; policy_number?: string } | null = null;

    if (policySource === 'pc') {
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
    } else if (policySource === 'health') {
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
    } else if (policySource === 'life') {
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
    } else if (policySource === 'medicare') {
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
    } else if (policySource === 'supplemental') {
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
      return NextResponse.json({ error: 'Policy not found.' }, { status: 404 });
    }

    // Authorize client access (admin, assigned agent, or shared agent)
    const authResult = await authorizeClientAccess(adminDb, actorWinterfellProfileId, policyRecord.client_id);

    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Actor is not authorized to access this policy.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      policy: {
        id: policyRecord.id,
        carrier: policyRecord.carrier || '',
        policy_number_masked: maskPolicyNumber(policyRecord.policy_number),
        line_type: policySource,
        client_id: policyRecord.client_id,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
