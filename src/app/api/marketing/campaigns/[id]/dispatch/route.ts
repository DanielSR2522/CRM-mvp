import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { validateCampaignOwnership, getAuthorizedAgentIds } from '@/lib/marketing/auth-guard';
import { getDeliveryProvider } from '@/lib/marketing/delivery-provider';
import { evaluateSegmentCandidates } from '@/lib/marketing/segment-evaluator';
import { evaluateRecipientSafety } from '@/lib/marketing/safety-engine';
import { generateUnsubscribeToken } from '@/lib/marketing/unsubscribe-service';
import { replacePersonalizationTokens } from '@/lib/marketing/personalization';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

  try {
    // 1. Authenticate & validate ownership + authorized agent scope
    const authResult = await validateCampaignOwnership(req, campaignId, dbClient);
    if (!authResult.authorized || !authResult.campaign) {
      return NextResponse.json(
        { error: authResult.error || 'Access denied' },
        { status: authResult.status }
      );
    }

    const campaign = authResult.campaign;
    const authorizedAgentId = authResult.agentId;
    const authorizedAgentIds = await getAuthorizedAgentIds(req, dbClient);

    // 2. Double-send protection check
    if (['SENT', 'SENDING'].includes(campaign.status)) {
      return NextResponse.json(
        {
          error: `Safety Block: Campaign is already in '${campaign.status}' state. Double-sending is prevented.`,
        },
        { status: 409 }
      );
    }

    // Lock campaign status to SENDING
    await dbClient
      .from('marketing_campaigns')
      .update({ status: 'SENDING', updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    // 3. Fetch Segment filters & evaluate candidates
    let filters = {};
    if (campaign.segment_id) {
      const { data: seg } = await dbClient
        .from('marketing_segments')
        .select('filters')
        .eq('id', campaign.segment_id)
        .single();
      if (seg) filters = seg.filters || {};
    }

    const { candidates, suppressedEmails, hardBouncedEmails } = await evaluateSegmentCandidates(
      filters,
      dbClient,
      authorizedAgentIds
    );
    const safetySummary = evaluateRecipientSafety(candidates, suppressedEmails, hardBouncedEmails);

    if (safetySummary.validRecipients === 0) {
      await dbClient
        .from('marketing_campaigns')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', campaignId);

      return NextResponse.json(
        { error: 'Cannot send campaign: 0 valid recipients in audience after safety exclusions.' },
        { status: 400 }
      );
    }

    // 4. Initialize Delivery Provider (Mock vs Resend)
    const { provider, isLive } = getDeliveryProvider();
    const requestOrigin = req.nextUrl?.origin;
    const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (requestOrigin && !requestOrigin.includes('localhost') ? requestOrigin : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

    const validCandidates = safetySummary.details.filter((d) => !d.isExcluded);

    // 4.5 Defense-in-depth: Re-verify candidate ownership against authorizedAgentIds
    const verifiedCandidates = [];
    for (const cand of validCandidates) {
      if (cand.clientId) {
        const { data: clientRow } = await dbClient
          .from('clients')
          .select('id, agent_id')
          .eq('id', cand.clientId)
          .single();

        if (clientRow && clientRow.agent_id && !authorizedAgentIds.includes(clientRow.agent_id)) {
          console.warn(`Defense-in-depth security block: Candidate ${cand.email} (client ${cand.clientId}) belongs to unauthorized agent '${clientRow.agent_id}'. Excluding from dispatch.`);
          continue;
        }
      }
      verifiedCandidates.push(cand);
    }

    if (verifiedCandidates.length === 0) {
      await dbClient
        .from('marketing_campaigns')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', campaignId);

      return NextResponse.json(
        { error: '403 Forbidden: 0 authorized recipients in audience scope for this agent.' },
        { status: 403 }
      );
    }

    // 5. Server-side Batch Processing (50 per batch)
    const BATCH_SIZE = 50;
    let sentCount = 0;
    let failCount = 0;

    for (let i = 0; i < verifiedCandidates.length; i += BATCH_SIZE) {
      const batchCandidates = verifiedCandidates.slice(i, i + BATCH_SIZE);

      const batchOptions = batchCandidates.map((cand) => {
        const unsubToken = generateUnsubscribeToken({
          email: cand.email,
          campaignId: campaign.id,
          recipientId: cand.clientId || cand.leadId,
        });

        const unsubUrl = `${appBaseUrl}/marketing/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

        const personalizedHtml = replacePersonalizationTokens(campaign.content_html || '', {
          first_name: cand.name.split(' ')[0],
          last_name: cand.name.split(' ').slice(1).join(' '),
          agent_name: campaign.from_name || 'Agent',
          carrier: 'Insurance Provider',
          policy_number: 'N/A',
        });

        // Ensure unsubscribe footer
        const finalHtml = personalizedHtml.includes('unsubscribe')
          ? personalizedHtml
          : `${personalizedHtml}<hr/><p style="font-size:11px;color:#64748b;text-align:center;">Unsubscribe from marketing emails <a href="${unsubUrl}">here</a>.</p>`;

        return {
          fromName: campaign.from_name || 'SmarTrack Agent',
          fromAddress: process.env.RESEND_FROM_EMAIL || campaign.from_email || 'consents@mail.smartrackcrm.com',
          replyToAddress: campaign.reply_to || campaign.from_email || 'agent@smartrack.com',
          toAddress: cand.email,
          subject: campaign.subject || 'SmarTrack Notice',
          htmlContent: finalHtml,
          campaignId: campaign.id,
          recipientId: cand.clientId || cand.leadId,
          unsubscribeUrl: unsubUrl,
        };
      });

      const batchResults = await provider.sendBatch(batchOptions);

      // Record recipients and events in database
      for (let j = 0; j < batchResults.length; j++) {
        const res = batchResults[j];
        const cand = batchCandidates[j];
        const unsubToken = generateUnsubscribeToken({
          email: cand.email,
          campaignId: campaign.id,
          recipientId: cand.clientId || cand.leadId,
        });

        if (res.success) {
          sentCount++;
          await dbClient.from('marketing_campaign_recipients').insert([
            {
              campaign_id: campaignId,
              client_id: cand.clientId || null,
              lead_id: cand.leadId || null,
              recipient_email: cand.email,
              provider_message_id: res.providerMessageId || null,
              unsubscribe_token: unsubToken,
              status: 'SENT',
              sent_at: new Date().toISOString(),
            },
          ]);

          await dbClient.from('marketing_delivery_events').insert([
            {
              campaign_id: campaignId,
              event_type: 'SENT',
              metadata: {
                recipient_email: cand.email,
                provider_message_id: res.providerMessageId,
                is_mock_mode: res.isMockMode,
              },
            },
          ]);
        } else {
          failCount++;
          await dbClient.from('marketing_campaign_recipients').insert([
            {
              campaign_id: campaignId,
              client_id: cand.clientId || null,
              lead_id: cand.leadId || null,
              recipient_email: cand.email,
              status: 'FAILED',
              exclusion_reason: res.error || 'Delivery failed',
            },
          ]);
        }
      }
    }

    // 6. Complete Campaign Status Update
    const finalStatus = sentCount > 0 ? 'SENT' : 'FAILED';
    await dbClient
      .from('marketing_campaigns')
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        total_matched: safetySummary.totalMatched,
        valid_recipients: sentCount,
        excluded_duplicates: safetySummary.excludedDuplicates,
        excluded_invalid_email: safetySummary.excludedInvalidEmail,
        excluded_unsubscribed: safetySummary.excludedUnsubscribed,
        excluded_bounced: safetySummary.excludedBounced,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    return NextResponse.json({
      success: true,
      mode: isLive ? 'LIVE_RESEND_DELIVERY' : 'SAFE_MOCK_MODE',
      sentCount,
      failCount,
      safetySummary,
      message: `Campaign dispatched to ${sentCount} recipients (${isLive ? 'Live Resend Delivery' : 'Safe Mock Delivery'}).`,
    });
  } catch (err: any) {
    console.error('Campaign dispatch error:', err);
    await dbClient
      .from('marketing_campaigns')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    return NextResponse.json({ error: err?.message || 'Server error during campaign dispatch' }, { status: 500 });
  }
}
