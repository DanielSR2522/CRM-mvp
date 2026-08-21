import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { formatDateMMDDYYYY } from '@/lib/formatters/date';
import { generateSecureToken } from '@/lib/consents/token-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ISSUABLE_STATUSES = ['draft', 'pending', 'sent', 'viewed'];

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');

  if (!local || !domain) return '***';

  const visible = local.slice(0, Math.min(2, local.length));

  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function tokenHashPrefix(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 12) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await context.params;

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'This service is not available right now.' },
      { status: 503 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || (process.env.NODE_ENV === 'production' ? 'https://smartrackcrm.com' : 'http://localhost:3001');

  if (!resendApiKey || !resendFromEmail) {
    return NextResponse.json(
      { error: 'Email delivery is not configured.' },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: userData, error: userError } =
    await admin.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: 'Your session has expired.' },
      { status: 401 }
    );
  }

  const userId = userData.user.id;

  const { data: consent, error: consentError } = await admin
    .from('signature_requests')
    .select('id, client_id, title, status, expires_at')
    .eq('id', requestId)
    .maybeSingle();

  if (consentError || !consent) {
    return NextResponse.json(
      { error: 'Consent not found.' },
      { status: 404 }
    );
  }

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('agent_id')
    .eq('id', consent.client_id)
    .maybeSingle();

  /*
   * Return the same 404 for missing and unauthorized records.
   * This prevents one agent from discovering another agent's consent IDs.
   */
  if (clientError || !client || client.agent_id !== userId) {
    return NextResponse.json(
      { error: 'Consent not found.' },
      { status: 404 }
    );
  }

  if (!ISSUABLE_STATUSES.includes(consent.status)) {
    return NextResponse.json(
      {
        error: `A signing link cannot be issued for a consent that is "${consent.status}".`,
      },
      { status: 409 }
    );
  }

  const { data: signer, error: signerError } = await admin
    .from('signature_request_signers')
    .select(
      'id, full_name, email, signed_at, declined_at, token_hash, token_expires_at'
    )
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (signerError || !signer) {
    return NextResponse.json(
      { error: 'This consent has no signer.' },
      { status: 409 }
    );
  }

  if (!signer.email?.trim()) {
    return NextResponse.json(
      { error: 'This signer has no email address on file.' },
      { status: 409 }
    );
  }

  const signerEmail = signer.email.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
    return NextResponse.json(
      { error: 'The signer email address is invalid.' },
      { status: 409 }
    );
  }

  if (signer.signed_at) {
    return NextResponse.json(
      { error: 'This signer has already signed.' },
      { status: 409 }
    );
  }

  if (signer.declined_at) {
    return NextResponse.json(
      { error: 'This signer has declined the consent.' },
      { status: 409 }
    );
  }

  const expiresAt = consent.expires_at
    ? new Date(consent.expires_at)
    : new Date(signer.token_expires_at);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: 'This consent has expired.' },
      { status: 409 }
    );
  }

  const previousHashPrefix = tokenHashPrefix(signer.token_hash);
  const token = await generateSecureToken();

  const { error: tokenUpdateError } = await admin
    .from('signature_request_signers')
    .update({
      token_hash: token.hash,
      token_expires_at: expiresAt.toISOString(),
      token_revoked_at: null,
    })
    .eq('id', signer.id);

  if (tokenUpdateError) {
    console.error('Could not rotate signer token:', tokenUpdateError.message);

    return NextResponse.json(
      { error: 'The secure signing link could not be created.' },
      { status: 500 }
    );
  }

  const signingUrl = `${appUrl}/sign/${token.raw}`;
  const signerName = signer.full_name?.trim() || 'Client';
  const documentTitle = consent.title?.trim() || 'Document';

  const subject = `Document to sign: ${documentTitle}`;

  const text = [
    `Hi ${signerName},`,
    '',
    `SmarTrack CRM has sent you a document to review and sign electronically:`,
    `"${documentTitle}"`,
    '',
    'Open the document here:',
    signingUrl,
    '',
    `This secure link expires on ${formatDateMMDDYYYY(expiresAt)}.`,
    'Please do not share it with anyone else.',
    '',
    'If you were not expecting this message, you can ignore it.',
    '',
    'SmarTrack CRM',
  ].join('\n');

  await admin.from('signature_events').insert([
    {
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'link_revoked',
      metadata: {
        reason: 'email_delivery_requested',
        previous_token_hash_prefix: previousHashPrefix,
      },
    },
    {
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'link_issued',
      metadata: {
        token_hash_prefix: tokenHashPrefix(token.hash),
        expires_at: expiresAt.toISOString(),
      },
    },
  ]);

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [signerEmail],
      subject,
      text,
    }),
  });

  const resendResult = (await resendResponse.json()) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!resendResponse.ok || !resendResult.id) {
    const providerMessage =
      resendResult.message || resendResult.name || 'Resend rejected the email.';

    console.error('Resend delivery failed:', providerMessage);

    await admin.from('signature_delivery_attempts').insert({
      request_id: requestId,
      signer_id: signer.id,
      channel: 'email',
      destination: maskEmail(signerEmail),
      status: 'failed',
      provider_reference: null,
      completed_at: new Date().toISOString(),
      error_message: providerMessage,
      metadata: {
        reason: 'provider_rejected',
      },
    });

    await admin.from('signature_events').insert({
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'email_failed',
      channel: 'email',
      metadata: {
        delivery_status: 'failed',
      },
    });

    return NextResponse.json(
      {
        error:
          'The email could not be sent. The secure link remains available for another channel.',
      },
      { status: 502 }
    );
  }

  await admin.from('signature_delivery_attempts').insert({
    request_id: requestId,
    signer_id: signer.id,
    channel: 'email',
    destination: maskEmail(signerEmail),
    status: 'sent',
    provider_reference: resendResult.id,
    completed_at: null,
    error_message: null,
    metadata: {
      sent_at: new Date().toISOString(),
    },
  });

  await admin.from('signature_events').insert({
    request_id: requestId,
    signer_id: signer.id,
    performed_by: userId,
    event_type: 'email_sent',
    channel: 'email',
    metadata: {
      delivery_status: 'sent',
      provider_reference: resendResult.id,
    },
  });

  await admin
    .from('signature_requests')
    .update({
      selected_delivery_channel: 'email',
      sent_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  /*
   * The consent state machine does not permit draft → sent directly.
   * Move draft through pending first.
   */
  if (consent.status === 'draft') {
    await admin
      .from('signature_requests')
      .update({ status: 'pending' })
      .eq('id', requestId);

    await admin
      .from('signature_requests')
      .update({ status: 'sent' })
      .eq('id', requestId);
  } else if (consent.status !== 'sent') {
    await admin
      .from('signature_requests')
      .update({ status: 'sent' })
      .eq('id', requestId);
  }

  return NextResponse.json({
    success: true,
    message: `Email sent to ${maskEmail(signerEmail)}.`,
    providerReference: resendResult.id,
    signingUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
