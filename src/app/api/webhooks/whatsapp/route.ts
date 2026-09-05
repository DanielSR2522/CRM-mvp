import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { validateWebhookSignature } from '@/lib/whatsapp/cloud-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * WhatsApp Cloud API webhook handler.
 *
 * GET  — Meta hub verification (called once when you register the webhook URL).
 * POST — Incoming WhatsApp message status events (sent, delivered, read, failed).
 *
 * Security:
 *   - GET uses WHATSAPP_VERIFY_TOKEN to confirm the request is from Meta.
 *   - POST validates X-Hub-Signature-256 using WHATSAPP_APP_SECRET before
 *     processing any payload — payloads without a valid signature are rejected
 *     with 401 and not processed.
 *
 * Idempotency:
 *   - Duplicate webhooks from Meta are silently ignored. Before inserting
 *     any signature_events row we check whether one already exists with the
 *     same provider_reference and event_type. Duplicates produce no DB write.
 *   - The delivery attempt row is updated (not inserted) so duplicate webhooks
 *     cannot produce duplicate rows.
 *
 * Status model:
 *   - WhatsApp delivery statuses (sent, delivered, read, failed) are recorded
 *     in signature_delivery_attempts and signature_events.
 *   - They do NOT change signature_requests.status. "delivered" from Meta
 *     means the phone received it; "signed" means the document was signed.
 *     These are different facts and must not be conflated.
 */

// Map Meta webhook statuses to our delivery attempt status values.
const META_STATUS_MAP: Record<string, string> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',    // 'read' is a stronger form of 'delivered' — use 'delivered' status
  failed: 'failed',
};

// Map Meta webhook statuses to signature_events event_type values.
// 'whatsapp_sent' is already recorded by the send route, so we don't
// re-record it here — we only record the progression events.
const META_EVENT_TYPE_MAP: Record<string, string | null> = {
  sent: null,           // already recorded at send time; skip duplicate
  delivered: 'request_sent',  // closest existing type for "confirmed delivered"
  read: 'document_viewed',    // client opened/read — closest semantic match
  failed: 'delivery_failed',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (!verifyToken) {
    console.error('[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN is not set.');
    return NextResponse.json(
      { error: 'Webhook verification is not configured.' },
      { status: 503 }
    );
  }

  if (mode === 'subscribe' && token === verifyToken) {
    // Return the challenge as plain text — Meta requires exactly this.
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    { error: 'Webhook verification failed.' },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  // -------------------------------------------------------------------------
  // 1. Read and validate the webhook signature BEFORE touching the payload.
  //    An attacker who can craft a valid HMAC-SHA256 has the app secret —
  //    there is no meaningful security model without this check.
  // -------------------------------------------------------------------------
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  const isValid = await validateWebhookSignature(rawBody, signature);
  if (!isValid) {
    // Do NOT include details about why it failed — an attacker learns nothing.
    console.warn('[whatsapp-webhook] Invalid or missing X-Hub-Signature-256. Payload rejected.');
    return NextResponse.json(
      { error: 'Invalid signature.' },
      { status: 401 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. Parse the webhook payload
  // -------------------------------------------------------------------------
  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    // A body we cannot parse is not a Meta webhook — reject it.
    return NextResponse.json(
      { error: 'Invalid JSON payload.' },
      { status: 400 }
    );
  }

  // Always return 200 to Meta promptly — if we take too long, Meta retries.
  // Processing happens asynchronously below.
  processWebhookPayload(payload).catch((err) => {
    console.error(
      '[whatsapp-webhook] Error processing payload:',
      err instanceof Error ? err.message : err
    );
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Payload processing (async, after 200 is returned to Meta)
// ---------------------------------------------------------------------------

async function processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (!isAdminConfigured()) {
    console.error('[whatsapp-webhook] Admin client is not configured; cannot process payload.');
    return;
  }

  const admin = getSupabaseAdmin();

  const entries = payload?.entry ?? [];

  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      const statuses = change?.value?.statuses ?? [];
      for (const statusEvent of statuses) {
        await processStatusEvent(admin, statusEvent);
      }
    }
  }
}

async function processStatusEvent(
  admin: ReturnType<typeof getSupabaseAdmin>,
  event: WhatsAppStatusEvent
): Promise<void> {
  const wamid = event?.id?.trim();
  const metaStatus = event?.status?.toLowerCase();
  const timestamp = event?.timestamp;

  if (!wamid || !metaStatus) {
    console.warn('[whatsapp-webhook] Skipping status event with missing id or status.');
    return;
  }

  const ourStatus = META_STATUS_MAP[metaStatus];
  if (!ourStatus) {
    // Unknown status — log it but don't error out.
    console.log(`[whatsapp-webhook] Unrecognised Meta status "${metaStatus}" for wamid ${wamid} — ignoring.`);
    return;
  }

  // -------------------------------------------------------------------------
  // Find the delivery attempt by provider_reference (the WAMID).
  // -------------------------------------------------------------------------
  const { data: attempt, error: findError } = await admin
    .from('signature_delivery_attempts')
    .select('id, request_id, signer_id, status, channel')
    .eq('provider_reference', wamid)
    .maybeSingle();

  if (findError) {
    console.error(
      `[whatsapp-webhook] DB error looking up wamid ${wamid}:`,
      findError.message
    );
    return;
  }

  if (!attempt) {
    // Legitimate case: a webhook arrived for a message we don't know about.
    // This can happen if:
    //   - The WAMID was from a test message sent directly from Meta Dashboard.
    //   - A previous insert of the delivery attempt failed silently.
    // Log it and move on — we cannot do anything useful without the record.
    console.log(`[whatsapp-webhook] No delivery attempt found for wamid ${wamid} — ignoring.`);
    return;
  }

  // Idempotency: if we already have an event with this wamid and the same
  // status, skip the write entirely.
  const eventType = META_EVENT_TYPE_MAP[metaStatus];
  if (eventType) {
    const { data: existing } = await admin
      .from('signature_events')
      .select('id')
      .eq('request_id', attempt.request_id)
      .eq('event_type', eventType)
      .eq('metadata->>provider_reference', wamid)
      .maybeSingle();

    if (existing) {
      console.log(
        `[whatsapp-webhook] Duplicate event type="${eventType}" for wamid ${wamid} — skipping.`
      );
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Update the delivery attempt status.
  // We use UPDATE not INSERT to keep idempotency simple: if the same webhook
  // fires twice, the row is updated to the same value (a no-op).
  // -------------------------------------------------------------------------
  const occurredAt = timestamp
    ? new Date(Number(timestamp) * 1000).toISOString()
    : new Date().toISOString();

  await admin
    .from('signature_delivery_attempts')
    .update({
      status: ourStatus,
      completed_at: metaStatus === 'delivered' || metaStatus === 'read' || metaStatus === 'failed'
        ? occurredAt
        : undefined,
      error_message:
        metaStatus === 'failed'
          ? extractFailureReason(event)
          : undefined,
      metadata: {
        last_meta_status: metaStatus,
        updated_at: new Date().toISOString(),
        transport: 'cloud_api',
      },
    })
    .eq('id', attempt.id);

  // -------------------------------------------------------------------------
  // Record a signature_events audit entry.
  // Skip 'sent' — that was already recorded by the send-whatsapp route.
  // -------------------------------------------------------------------------
  if (eventType) {
    await admin
      .from('signature_events')
      .insert({
        request_id: attempt.request_id,
        signer_id: attempt.signer_id,
        performed_by: null,  // system event, not an agent action
        event_type: eventType,
        channel: 'whatsapp',
        metadata: {
          delivery_status: ourStatus,
          meta_status: metaStatus,
          provider_reference: wamid,
          occurred_at: occurredAt,
          transport: 'cloud_api',
        },
      })
      .then(({ error }) => {
        if (error) {
          console.warn(
            `[whatsapp-webhook] Could not insert ${eventType} event for wamid ${wamid}:`,
            error.message
          );
        }
      });
  }

  // -------------------------------------------------------------------------
  // On failure: record a delivery_failed event with the safe reason.
  // -------------------------------------------------------------------------
  if (metaStatus === 'failed') {
    const safeReason = extractFailureReason(event);
    console.warn(
      `[whatsapp-webhook] Message ${wamid} failed: ${safeReason}`
    );

    // delivery_failed is already handled by the eventType mapping above.
    // Log only — no additional DB write needed here.
  }

  console.log(
    `[whatsapp-webhook] Processed wamid=${wamid} status=${metaStatus} → ourStatus=${ourStatus}`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFailureReason(event: WhatsAppStatusEvent): string {
  // Meta puts error info in errors[] or in error{}. Extract a safe summary.
  const errors = event?.errors ?? [];
  if (errors.length > 0) {
    const code = errors[0]?.code;
    const title = errors[0]?.title;
    // Return code + title but not any customer-identifying details.
    return code ? `Meta error ${code}${title ? ': ' + title : ''}` : 'Unknown Meta error';
  }
  return 'Meta reported delivery failure';
}

// ---------------------------------------------------------------------------
// Type definitions (Meta webhook payload shapes)
// ---------------------------------------------------------------------------

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        statuses?: WhatsAppStatusEvent[];
        messages?: unknown[];
      };
      field?: string;
    }>;
  }>;
}

interface WhatsAppStatusEvent {
  id?: string;          // WAMID
  status?: string;      // 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string;   // Unix timestamp (string)
  recipient_id?: string;
  conversation?: unknown;
  pricing?: unknown;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: unknown;
  }>;
}
