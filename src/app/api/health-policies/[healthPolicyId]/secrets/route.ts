import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { encryptField, decryptField } from '@/lib/health/encryption';

export const dynamic = 'force-dynamic';

const SENSITIVE_FIELDS_MAP: { [key: string]: { cipher: string; iv: string; tag: string } } = {
  user_name: {
    cipher: 'user_name_ciphertext',
    iv: 'user_name_iv',
    tag: 'user_name_auth_tag'
  },
  password_val: {
    cipher: 'password_ciphertext',
    iv: 'password_iv',
    tag: 'password_auth_tag'
  },
  security_question: {
    cipher: 'security_question_ciphertext',
    iv: 'security_question_iv',
    tag: 'security_question_auth_tag'
  },
  company_user: {
    cipher: 'company_user_ciphertext',
    iv: 'company_user_iv',
    tag: 'company_user_auth_tag'
  },
  company_password: {
    cipher: 'company_password_ciphertext',
    iv: 'company_password_iv',
    tag: 'company_password_auth_tag'
  }
};

const FLAGS_MAP: { [key: string]: string } = {
  user_name: 'has_user_name',
  password_val: 'has_password_val',
  security_question: 'has_security_question',
  company_user: 'has_company_user',
  company_password: 'has_company_password'
};

/**
 * Validates agent session and retrieves the policy, verifying agent owns the client.
 */
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

  // Retrieve health policy details along with agent owner of the client
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
    // Return 404 to avoid leaking existence of policy
    return NextResponse.json({ error: 'Health Policy not found.' }, { status: 404 });
  }

  return { userId, clientId: row.client_id, row };
}

/**
 * GET /api/health-policies/[healthPolicyId]/secrets?field=user_name
 *
 * Reveals a single sensitive field value.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ healthPolicyId: string }> }
) {
  const { healthPolicyId } = await context.params;
  const { searchParams } = new URL(request.url);
  const fieldName = searchParams.get('field');

  if (!fieldName || !SENSITIVE_FIELDS_MAP[fieldName]) {
    return NextResponse.json({ error: 'Invalid or missing field parameter.' }, { status: 400 });
  }

  const authResult = await authenticateAndVerifyOwnership(request, healthPolicyId);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { clientId } = authResult;
  const cols = SENSITIVE_FIELDS_MAP[fieldName];

  const admin = getSupabaseAdmin();
  const { data: secretRow, error: secretError } = await admin
    .from('health_policy_secrets')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .maybeSingle();

  if (secretError) {
    console.error('Database error fetching secrets:', secretError);
    return NextResponse.json({ error: 'Database error fetching secrets.' }, { status: 500 });
  }

  const ciphertext = secretRow ? (secretRow[cols.cipher] as string | undefined) : undefined;
  const iv = secretRow ? (secretRow[cols.iv] as string | undefined) : undefined;
  const authTag = secretRow ? (secretRow[cols.tag] as string | undefined) : undefined;

  if (!ciphertext || !iv || !authTag) {
    return NextResponse.json({ value: '' }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  try {
    const decrypted = decryptField(ciphertext, iv, authTag, healthPolicyId, clientId, fieldName);
    return NextResponse.json({ value: decrypted }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    console.error(`Failed to decrypt field ${fieldName}:`, err);
    return NextResponse.json({ error: 'Decryption failed. Data might be corrupted or key mismatch.' }, { status: 500 });
  }
}

/**
 * PUT /api/health-policies/[healthPolicyId]/secrets
 *
 * Encrypts and saves a single sensitive field value.
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
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { fieldName, value } = body;
  if (!fieldName || !SENSITIVE_FIELDS_MAP[fieldName]) {
    return NextResponse.json({ error: 'Invalid or missing fieldName.' }, { status: 400 });
  }

  const authResult = await authenticateAndVerifyOwnership(request, healthPolicyId);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { clientId } = authResult;
  const cols = SENSITIVE_FIELDS_MAP[fieldName];

  try {
    // Encrypt the value securely
    const { ciphertext, iv, authTag } = encryptField(value || '', healthPolicyId, clientId, fieldName);

    const admin = getSupabaseAdmin();
    
    // Upsert into health_policy_secrets
    const { error: secretsErr } = await admin
      .from('health_policy_secrets')
      .upsert({
        health_policy_id: healthPolicyId,
        [cols.cipher]: ciphertext || null,
        [cols.iv]: iv || null,
        [cols.tag]: authTag || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'health_policy_id' });

    if (secretsErr) throw secretsErr;

    // Update has_* flag in health_policies
    const flagField = FLAGS_MAP[fieldName];
    const { error: flagErr } = await admin
      .from('health_policies')
      .update({
        [flagField]: !!value,
        updated_at: new Date().toISOString()
      })
      .eq('id', healthPolicyId);

    if (flagErr) throw flagErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to save encrypted field ${fieldName}:`, err);
    return NextResponse.json({ error: message || 'Failed to save secret.' }, { status: 500 });
  }
}
