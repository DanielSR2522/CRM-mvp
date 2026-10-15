import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import {
  performCalendlySync,
  checkUserCalendarAuthorization,
  LONI_CRM_AGENT_ID,
} from '@/lib/calendar/calendly-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    let targetAgentId = LONI_CRM_AGENT_ID;
    try {
      const body = await req.json();
      if (body?.targetAgentId) {
        targetAgentId = body.targetAgentId;
      }
    } catch {
      // Body may be empty, default to LONI_CRM_AGENT_ID
    }

    // Strictly verify authorization server-side
    const authCheck = await checkUserCalendarAuthorization(user.id, targetAgentId);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.reason || 'Forbidden.' }, { status: 403 });
    }

    const result = await performCalendlySync(user.id, targetAgentId);
    return NextResponse.json({
      ...result,
      targetAgentId,
      targetAgentName: authCheck.targetAgentName,
      isAdminViewAs: authCheck.isAdmin && user.id !== targetAgentId,
    });
  } catch (err: any) {
    console.error('[API /api/calendar/calendly/sync Error]:', err?.message || err);
    return NextResponse.json(
      {
        error: err?.message || 'Failed to synchronize Calendly bookings.',
      },
      { status: 400 }
    );
  }
}
