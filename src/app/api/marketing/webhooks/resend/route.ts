import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { addSuppression } from '@/lib/marketing/marketing-service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    // Optional signature check if secret is configured
    const sigHeader = req.headers.get('svix-signature') || req.headers.get('x-resend-signature');
    if (webhookSecret && !sigHeader) {
      return NextResponse.json({ error: 'Missing webhook signature header' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    const eventType = payload.type;
    const data = payload.data || {};
    const providerEventId = payload.id || data.email_id || `evt-${Date.now()}`;
    const tags = data.tags || [];

    const campaignIdTag = tags.find((t: any) => t.name === 'campaign_id');
    const campaignId = campaignIdTag ? campaignIdTag.value : data.campaign_id || null;

    if (!campaignId) {
      return NextResponse.json({ status: 'IGNORED', reason: 'Non-campaign email event' }, { status: 200 });
    }

    // 1. Idempotency Check: check if provider_event_id has already been processed
    if (providerEventId) {
      const { data: existing } = await supabase
        .from('marketing_delivery_events')
        .select('id')
        .eq('provider_event_id', providerEventId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ status: 'ALREADY_PROCESSED', providerEventId }, { status: 200 });
      }
    }

    // 2. Event Type Mapping
    let mappedEventType: any = null;
    if (eventType === 'email.sent') mappedEventType = 'SENT';
    else if (eventType === 'email.delivered') mappedEventType = 'DELIVERED';
    else if (eventType === 'email.opened') mappedEventType = 'OPENED';
    else if (eventType === 'email.clicked') mappedEventType = 'CLICKED';
    else if (eventType === 'email.bounced') mappedEventType = 'BOUNCED';
    else if (eventType === 'email.complained') mappedEventType = 'COMPLAINED';

    if (!mappedEventType) {
      return NextResponse.json({ status: 'IGNORED_EVENT_TYPE', eventType }, { status: 200 });
    }

    // 3. Insert Delivery Event
    await supabase.from('marketing_delivery_events').insert([
      {
        campaign_id: campaignId,
        provider_event_id: providerEventId,
        event_type: mappedEventType,
        metadata: {
          to: data.to,
          subject: data.subject,
          created_at: data.created_at,
          raw_type: eventType,
        },
      },
    ]);

    // 4. Auto-Suppression Logic
    const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;

    if (recipientEmail && typeof recipientEmail === 'string') {
      if (eventType === 'email.bounced') {
        await addSuppression(
          recipientEmail,
          'HARD_BOUNCE',
          `Auto-suppressed via Resend webhook (bounced on campaign ${campaignId})`
        );
      } else if (eventType === 'email.complained') {
        await addSuppression(
          recipientEmail,
          'COMPLAINT',
          `Auto-suppressed via Resend webhook (complaint on campaign ${campaignId})`
        );
      }
    }

    return NextResponse.json({ success: true, processedEvent: mappedEventType, providerEventId });
  } catch (err: any) {
    console.error('Resend Webhook error:', err);
    return NextResponse.json({ error: err?.message || 'Webhook error' }, { status: 500 });
  }
}
