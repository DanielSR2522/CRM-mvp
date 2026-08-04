import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { encryptField, decryptField } from '@/lib/health/encryption';

export const dynamic = 'force-dynamic';

const SENSITIVE_MEMBER_FIELDS: { [key: string]: string } = {
  ssn: 'ssn_encrypted',
  immigration_card_number: 'immigration_card_number_encrypted',
  immigration_uscis_number: 'immigration_uscis_number_encrypted',
  immigration_alien_number: 'immigration_alien_number_encrypted'
};

async function authenticateAndVerifyOwnership(
  request: Request,
  healthPolicyId: string
): Promise<{ userId: string; clientId: string; row: Record<string, unknown> } | Response> {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'This service is not available right now.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: row, error } = await admin
    .from('health_policies')
    .select('*, clients(agent_id)')
    .eq('id', healthPolicyId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Health Policy not found.' }, { status: 404 });
  }

  const client = row.clients as { agent_id?: string } | null;
  if (!client?.agent_id || client.agent_id !== userId) {
    return NextResponse.json({ error: 'Health Policy not found.' }, { status: 404 });
  }

  return { userId, clientId: row.client_id, row };
}

/**
 * GET /api/health-policies/[healthPolicyId]/tax-members/secrets?memberNumber=2&field=ssn
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ healthPolicyId: string }> }
) {
  const { healthPolicyId } = await context.params;
  const { searchParams } = new URL(request.url);
  const memberNumberStr = searchParams.get('memberNumber');
  const fieldName = searchParams.get('field');

  if (!memberNumberStr || !fieldName || !SENSITIVE_MEMBER_FIELDS[fieldName]) {
    return NextResponse.json({ error: 'Invalid parameters.' }, { status: 400 });
  }

  const memberNumber = parseInt(memberNumberStr, 10);
  if (isNaN(memberNumber) || memberNumber < 2) {
    return NextResponse.json({ error: 'Invalid member number.' }, { status: 400 });
  }

  const authResult = await authenticateAndVerifyOwnership(request, healthPolicyId);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { clientId } = authResult;
  const colName = SENSITIVE_MEMBER_FIELDS[fieldName];

  const admin = getSupabaseAdmin();
  const { data: memberRow, error: memberErr } = await admin
    .from('health_tax_household_members')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .eq('member_number', memberNumber)
    .maybeSingle();

  if (memberErr || !memberRow) {
    return NextResponse.json({ value: '' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const rawEncrypted = memberRow[colName] as string | null | undefined;
  if (!rawEncrypted) {
    return NextResponse.json({ value: '' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const { ciphertext, iv, authTag } = JSON.parse(rawEncrypted);
    const scopeField = `tax_member_${memberNumber}_${fieldName}`;
    const decrypted = decryptField(ciphertext, iv, authTag, healthPolicyId, clientId, scopeField);
    return NextResponse.json({ value: decrypted }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`Failed to decrypt tax member field ${fieldName}:`, err);
    return NextResponse.json({ error: 'Decryption failed.' }, { status: 500 });
  }
}

/**
 * PUT /api/health-policies/[healthPolicyId]/tax-members/secrets
 * Body: { memberNumber: number, fieldName: string, value: string }
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ healthPolicyId: string }> }
) {
  const { healthPolicyId } = await context.params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { memberNumber, fieldName, value } = body;
  if (!memberNumber || !fieldName || !SENSITIVE_MEMBER_FIELDS[fieldName]) {
    return NextResponse.json({ error: 'Invalid body parameters.' }, { status: 400 });
  }

  const authResult = await authenticateAndVerifyOwnership(request, healthPolicyId);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { clientId } = authResult;
  const colName = SENSITIVE_MEMBER_FIELDS[fieldName];

  try {
    let encryptedPayloadJson: string | null = null;
    if (value && value.trim()) {
      const scopeField = `tax_member_${memberNumber}_${fieldName}`;
      const { ciphertext, iv, authTag } = encryptField(value.trim(), healthPolicyId, clientId, scopeField);
      encryptedPayloadJson = JSON.stringify({ ciphertext, iv, authTag });
    }

    const admin = getSupabaseAdmin();
    const { error: updateErr } = await admin
      .from('health_tax_household_members')
      .update({
        [colName]: encryptedPayloadJson,
        updated_at: new Date().toISOString()
      })
      .eq('health_policy_id', healthPolicyId)
      .eq('member_number', Number(memberNumber));

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
