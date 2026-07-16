/**
 * POST /api/signature-requests/[requestId]/regenerate
 *
 * Retries a failed PDF generation. Agent-only.
 *
 * This route holds the service role, so it cannot lean on RLS the way the rest
 * of the CRM does. It verifies two things itself:
 *   1. the caller is a real, signed-in user (their bearer token is checked
 *      against Supabase Auth);
 *   2. that user is the agent who owns the consent's client.
 *
 * Without step 2 any authenticated agent could regenerate any other agent's
 * documents — the exact hole the service role opens and the reason it must never
 * be used without an explicit ownership check.
 *
 * It only retries a *failed* generation. "Do not silently regenerate a signed
 * document" is a hard rule: a second PDF would carry a different hash and there
 * would be no way to say which one the client signed.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { generateFinalDocuments } from '@/lib/signatures/document-generator';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'This service is not available right now.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Who is this, really? The token is checked against Auth, not decoded here.
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: row, error } = await admin
    .from('signature_requests')
    .select('id, status, final_document_status, final_document_error, clients(agent_id)')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Consent not found.' }, { status: 404 });
  }

  const client = (row as Record<string, unknown>).clients as { agent_id?: string } | null;

  // The ownership check the service role bypassed.
  if (!client?.agent_id || client.agent_id !== userId) {
    // Same answer as "not found": an agent has no business learning that another
    // agent's consent exists.
    return NextResponse.json({ error: 'Consent not found.' }, { status: 404 });
  }

  if (row.status !== 'signed') {
    return NextResponse.json(
      { error: 'This consent is not signed, so there is no document to generate.' },
      { status: 409 }
    );
  }
  if (row.final_document_status === 'generating') {
    return NextResponse.json({ error: 'Generation is already in progress.' }, { status: 409 });
  }

  // 'generated' with an error recorded means the PDF is fine but filing it under
  // the policy failed. That repair is allowed and is idempotent —
  // generateFinalDocuments short-circuits the build and only re-attempts the copy.
  // 'generated' with no error means there is genuinely nothing to do; rebuilding
  // would produce a second PDF with a different hash and no way to say which one
  // the client signed.
  if (row.final_document_status === 'generated' && !row.final_document_error) {
    return NextResponse.json(
      { error: 'This document is already generated and filed. It will not be rebuilt.' },
      { status: 409 }
    );
  }

  const result = await generateFinalDocuments(requestId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Generation failed again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path: result.signedPath, hash: result.finalHash });
}
