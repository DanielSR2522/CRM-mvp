import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import {
  verifyCalendlyUser,
  resolveCalendlyEventType,
  getCalendlyTargetEventUrl,
  checkUserCalendarAuthorization,
  logCalendarAuditAction,
  LONI_CRM_AGENT_ID,
} from '@/lib/calendar/calendly-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetAgentId = searchParams.get('targetAgentId') || LONI_CRM_AGENT_ID;

    const authCheck = await checkUserCalendarAuthorization(user.id, targetAgentId);
    const targetEventUrl = getCalendlyTargetEventUrl();

    if (!authCheck.authorized) {
      return NextResponse.json(
        {
          isConfigured: !!process.env.CALENDLY_ACCESS_TOKEN,
          isAuthorized: false,
          targetEventUrl,
          reason: authCheck.reason || 'Forbidden context.',
        },
        { status: 403 }
      );
    }

    // Audit log status check
    logCalendarAuditAction({
      action: 'VIEW_CALENDLY_STATUS',
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: authCheck.isAdmin ? 'admin' : (authCheck.isAssistant ? 'assistant' : 'agent'),
      targetAgentId,
      targetAgentName: authCheck.targetAgentName,
      details: {
        isViewAsMode: authCheck.isAdmin && user.id !== targetAgentId,
      },
    });

    // Verify Calendly credentials server-side without returning token
    try {
      const calendlyUser = await verifyCalendlyUser();
      const eventType = await resolveCalendlyEventType(calendlyUser.uri);

      return NextResponse.json({
        isConfigured: true,
        isAuthorized: true,
        isAdminViewAs: authCheck.isAdmin && user.id !== targetAgentId,
        actorUserId: user.id,
        targetAgentId,
        targetAgentName: authCheck.targetAgentName,
        connected: true,
        calendlyUserName: calendlyUser.name,
        calendlyUserEmail: calendlyUser.email,
        targetEventUrl,
        eventName: eventType.name,
      });
    } catch (verErr: any) {
      return NextResponse.json({
        isConfigured: !!process.env.CALENDLY_ACCESS_TOKEN,
        isAuthorized: true,
        isAdminViewAs: authCheck.isAdmin && user.id !== targetAgentId,
        actorUserId: user.id,
        targetAgentId,
        targetAgentName: authCheck.targetAgentName,
        connected: false,
        targetEventUrl,
        error: verErr?.message || 'Could not connect to Calendly.',
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        isConfigured: false,
        isAuthorized: false,
        error: err?.message || 'Failed to check Calendly status.',
      },
      { status: 500 }
    );
  }
}
