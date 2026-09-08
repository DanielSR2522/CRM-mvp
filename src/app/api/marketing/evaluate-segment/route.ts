import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent, getAuthorizedAgentIds } from '@/lib/marketing/auth-guard';
import { evaluateSegmentCandidates } from '@/lib/marketing/segment-evaluator';
import { evaluateRecipientSafety } from '@/lib/marketing/safety-engine';

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    if (!authUser?.agentId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Server-side agent authentication required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const filters = body.filters || {};

    const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;
    const authorizedAgentIds = await getAuthorizedAgentIds(req, dbClient);

    const { candidates, suppressedEmails, hardBouncedEmails } = await evaluateSegmentCandidates(
      filters,
      dbClient,
      authorizedAgentIds
    );
    const safetySummary = evaluateRecipientSafety(candidates, suppressedEmails, hardBouncedEmails);

    return NextResponse.json({
      candidates,
      suppressedCount: suppressedEmails.size,
      hardBouncedCount: hardBouncedEmails.size,
      safetySummary,
    });
  } catch (err: any) {
    console.error('Error in evaluate-segment route:', err);
    return NextResponse.json({ error: err?.message || 'Failed to evaluate segment' }, { status: 500 });
  }
}
