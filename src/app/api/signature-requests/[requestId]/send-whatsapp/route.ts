import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { generateSecureToken } from '@/lib/consents/token-service';
import { formatDateMMDDYYYY } from '@/lib/formatters/date';
import {
  getWhatsAppConfig,
  normalizeToE164,
  selectTemplateName,
  sendConsentWhatsAppTemplate,
  WhatsAppConfigError,
  WhatsAppApiError,
} from '@/lib/whatsapp/cloud-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/signature-requests/[requestId]/send-whatsapp
 *
 * Sends a WhatsApp consent signature request through Meta's Cloud API.
 *
 * This is the server-side implementation of what the old WhatsApp adapter
 * attempted to do client-side with wa.me. The difference is real delivery:
 * Meta accepts the message, returns a WAMID, and later sends webhook callbacks
 * for sent/delivered/read/failed events.
 *
 * The consent status only advances to 'sent' after Meta returns a WAMID.
 * The UI must never claim success before that point.
 *
 * Security properties (all enforced here, never deferred to the client):
 *   - Agent must be authenticated (Bearer token validated server-side).
 *   - Agent must own the consent's client (clients.agent_id = userId).
 *   - Agent name is fetched from the profiles table — never accepted from input.
 *   - Phone is normalised to E.164 — never taken raw from the client.
 *   - Signing token is rotated here using generateSecureToken().
 *   - Raw Meta responses are never returned to the browser.
 *   - Access tokens are never logged.
 */

const ISSUABLE_STATUSES = ['draft', 'pending', 'sent', 'viewed'];

/** Safe hash prefix for audit rows — 12 hex chars, useless as a secret. */
function hashPrefix(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 12) : null;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await context.params;

  // -------------------------------------------------------------------------
  // 1. Infrastructure check
  // -------------------------------------------------------------------------
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'This service is not available right now.' },
      { status: 503 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. WhatsApp configuration check
  // -------------------------------------------------------------------------
  let whatsappConfig;
  try {
    whatsappConfig = getWhatsAppConfig();
  } catch (err) {
    console.error(
      '[send-whatsapp] Configuration error:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      {
        error:
          'WhatsApp delivery is not configured on this server. Contact your administrator.',
      },
      { status: 503 }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Agent authentication
  // -------------------------------------------------------------------------
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
      { error: 'Your session has expired. Sign in again.' },
      { status: 401 }
    );
  }

  const userId = userData.user.id;

  // -------------------------------------------------------------------------
  // 4. Load consent and verify ownership
  // -------------------------------------------------------------------------
  const { data: consent, error: consentError } = await admin
    .from('signature_requests')
    .select('id, client_id, title, status, expires_at, template_id')
    .eq('id', requestId)
    .maybeSingle();

  if (consentError || !consent) {
    return NextResponse.json({ error: 'Consent not found.' }, { status: 404 });
  }

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('agent_id, full_name')
    .eq('id', consent.client_id)
    .maybeSingle();

  // Same 404 for "not found" and "not yours" — prevents ID enumeration.
  if (clientError || !client || client.agent_id !== userId) {
    return NextResponse.json({ error: 'Consent not found.' }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 5. Validate consent status
  // -------------------------------------------------------------------------
  if (!ISSUABLE_STATUSES.includes(consent.status)) {
    return NextResponse.json(
      {
        error: `A signing link cannot be issued for a consent that is "${consent.status}".`,
      },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Load signer
  // -------------------------------------------------------------------------
  const { data: signer, error: signerError } = await admin
    .from('signature_request_signers')
    .select(
      'id, full_name, phone, email, signed_at, declined_at, token_hash, token_expires_at'
    )
    .eq('request_id', requestId)
    .order('signer_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (signerError || !signer) {
    return NextResponse.json(
      { error: 'This consent has no signer.' },
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

  // -------------------------------------------------------------------------
  // 7. Validate phone number
  // -------------------------------------------------------------------------
  if (!signer.phone?.trim()) {
    return NextResponse.json(
      {
        error:
          'This signer has no phone number on file. Add a phone number to their record before sending via WhatsApp.',
      },
      { status: 409 }
    );
  }

  const e164Phone = normalizeToE164(signer.phone);
  if (!e164Phone) {
    return NextResponse.json(
      {
        error: `The phone number "${signer.phone}" could not be converted to an international format. Please update the signer's phone number with a complete number including country code (e.g. +13055551234) and try again.`,
      },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 8. Validate consent expiry
  // -------------------------------------------------------------------------
  const expiresAt = consent.expires_at
    ? new Date(consent.expires_at)
    : new Date(signer.token_expires_at);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'This consent has expired. Extend it before sending.' },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 9. Load agent profile for agent_name
  // -------------------------------------------------------------------------
  const { data: profile } = await admin
    .from('profiles')
    .select('name, first_name, last_name, agency_name')
    .eq('id', userId)
    .maybeSingle();

  // Prefer: full "name" field, fallback: first+last, fallback: agency_name.
  const agentName =
    profile?.name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    null;

  if (!agentName) {
    return NextResponse.json(
      {
        error:
          'Your agent profile does not have a name set. Please complete your profile before sending via WhatsApp.',
      },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 10. Determine template language from consent template
  // -------------------------------------------------------------------------
  let templateLanguage: 'en' | 'es' = 'en'; // safe default

  const { data: template } = await admin
    .from('consent_templates')
    .select('language')
    .eq('id', consent.template_id)
    .maybeSingle();

  if (template?.language === 'es' || template?.language === 'en') {
    templateLanguage = template.language;
  }

  const templateName = selectTemplateName(whatsappConfig, templateLanguage);

  // -------------------------------------------------------------------------
  // 11. Rotate signing token
  // -------------------------------------------------------------------------
  const previousHashPrefix = hashPrefix(signer.token_hash);
  const token = await generateSecureToken();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    (process.env.NODE_ENV === 'production'
      ? 'https://smartrackcrm.com'
      : 'http://localhost:3001');

  const signingUrl = `${appUrl}/sign/${token.raw}`;

  const { error: tokenUpdateError } = await admin
    .from('signature_request_signers')
    .update({
      token_hash: token.hash,
      token_expires_at: expiresAt.toISOString(),
      token_revoked_at: null,
    })
    .eq('id', signer.id);

  if (tokenUpdateError) {
    console.error(
      '[send-whatsapp] Could not rotate signer token:',
      tokenUpdateError.message
    );
    return NextResponse.json(
      { error: 'The secure signing link could not be created. Please try again.' },
      { status: 500 }
    );
  }

  // Audit: log the link rotation events.
  await admin.from('signature_events').insert([
    {
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'link_revoked',
      metadata: {
        reason: 'whatsapp_delivery_requested',
        previous_token_hash_prefix: previousHashPrefix,
      },
    },
    {
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'link_issued',
      metadata: {
        token_hash_prefix: hashPrefix(token.hash),
        expires_at: expiresAt.toISOString(),
      },
    },
  ]);

  // -------------------------------------------------------------------------
  // 12. Send via Meta WhatsApp Cloud API
  // -------------------------------------------------------------------------
  const clientName = (client.full_name || signer.full_name || 'Client').trim();

  let wamid: string;

  try {
    const result = await sendConsentWhatsAppTemplate({
      config: whatsappConfig,
      toPhone: e164Phone,
      templateName,
      language: templateLanguage,
      clientName,
      agentName,
      consentLink: signingUrl,
    });
    wamid = result.messageId;
  } catch (err) {
    // Map known error types to appropriate HTTP responses.
    // Never expose the raw Meta error body to the browser.

    let userMessage: string;
    let httpStatus: number;

    if (err instanceof WhatsAppConfigError) {
      userMessage =
        'WhatsApp delivery is not configured on this server. Contact your administrator.';
      httpStatus = 503;
      console.error('[send-whatsapp] Config error:', err.message);
    } else if (err instanceof WhatsAppApiError) {
      userMessage = err.message; // already sanitized in cloud-api.ts
      // Distinguish client errors (4xx) from server/network errors (5xx, 0=network)
      httpStatus = err.httpStatus >= 400 && err.httpStatus < 500 ? 422 : 502;
      // Log the error code only, never the token or full body
      console.error(
        `[send-whatsapp] Meta API error HTTP ${err.httpStatus}:`,
        err.message
      );
    } else {
      userMessage = 'An unexpected error occurred while sending via WhatsApp. Please try again.';
      httpStatus = 500;
      console.error(
        '[send-whatsapp] Unexpected error:',
        err instanceof Error ? err.message : err
      );
    }

    // Record the failed delivery attempt.
    await admin
      .from('signature_delivery_attempts')
      .insert({
        request_id: requestId,
        signer_id: signer.id,
        channel: 'whatsapp',
        destination: maskPhone(signer.phone),
        status: 'failed',
        provider_reference: null,
        completed_at: new Date().toISOString(),
        error_message: 'Meta API rejected the message',  // generic — no secrets
        metadata: {
          sent_at: new Date().toISOString(),
          transport: 'cloud_api',
        },
      })
      .then(({ error: insertErr }) => {
        if (insertErr) {
          console.warn('[send-whatsapp] Could not record failed attempt:', insertErr.message);
        }
      });

    await admin
      .from('signature_events')
      .insert({
        request_id: requestId,
        signer_id: signer.id,
        performed_by: userId,
        event_type: 'delivery_failed',
        channel: 'whatsapp',
        metadata: {
          delivery_status: 'failed',
          transport: 'cloud_api',
        },
      })
      .then(({ error: eventErr }) => {
        if (eventErr) {
          console.warn('[send-whatsapp] Could not record delivery_failed event:', eventErr.message);
        }
      });

    return NextResponse.json({ error: userMessage }, { status: httpStatus });
  }

  // -------------------------------------------------------------------------
  // 13. Record successful delivery attempt
  // -------------------------------------------------------------------------
  await admin
    .from('signature_delivery_attempts')
    .insert({
      request_id: requestId,
      signer_id: signer.id,
      channel: 'whatsapp',
      destination: maskPhone(signer.phone),
      status: 'sent',
      provider_reference: wamid,
      completed_at: null,  // completed_at is set when Meta delivers
      error_message: null,
      metadata: {
        sent_at: new Date().toISOString(),
        transport: 'cloud_api',
        template: templateName,
        language: templateLanguage,
      },
    })
    .then(({ error: insertErr }) => {
      if (insertErr) {
        console.warn('[send-whatsapp] Could not record delivery attempt:', insertErr.message);
      }
    });

  // -------------------------------------------------------------------------
  // 14. Record whatsapp_sent audit event
  // -------------------------------------------------------------------------
  await admin
    .from('signature_events')
    .insert({
      request_id: requestId,
      signer_id: signer.id,
      performed_by: userId,
      event_type: 'whatsapp_sent',
      channel: 'whatsapp',
      metadata: {
        delivery_status: 'sent',
        transport: 'cloud_api',
        // wamid is acceptable in the audit trail; it is a message reference,
        // not a secret. It cannot be used to re-send or intercept the message.
        provider_reference: wamid,
        template: templateName,
        masked_destination: maskPhone(signer.phone),
      },
    })
    .then(({ error: eventErr }) => {
      if (eventErr) {
        console.warn('[send-whatsapp] Could not record whatsapp_sent event:', eventErr.message);
      }
    });

  // -------------------------------------------------------------------------
  // 15. Update selected_delivery_channel and advance status
  // -------------------------------------------------------------------------
  await admin
    .from('signature_requests')
    .update({
      selected_delivery_channel: 'whatsapp',
      sent_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // State machine: draft → pending → sent; pending/sent/viewed → sent.
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

  // -------------------------------------------------------------------------
  // 16. Return clean result — no secrets, no raw Meta data
  // -------------------------------------------------------------------------
  return NextResponse.json({
    success: true,
    message: `WhatsApp consent sent successfully to ${maskPhone(signer.phone)}.`,
    // signingUrl and expiresAt are returned so the dialog can show the manual
    // fallback link if the agent needs it. The token is embedded in the URL;
    // the dialog renders it but never logs it.
    signingUrl,
    expiresAt: expiresAt.toISOString(),
    sentAt: new Date().toISOString(),
    // wamid returned for agent UI transparency — it is a message reference ID,
    // NOT a secret. The client may display it for support reference purposes.
    providerReference: wamid,
    expiry: formatDateMMDDYYYY(expiresAt),
  });
}
