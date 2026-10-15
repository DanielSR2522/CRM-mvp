import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  checkUserCalendarAuthorization,
  logCalendarAuditAction,
} from '@/lib/calendar/calendly-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid session required.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const appointmentId =
      typeof body?.appointmentId === 'string' ? body.appointmentId.trim() : '';
    const rawClientId = body?.clientId;
    const targetClientId =
      rawClientId === null || rawClientId === ''
        ? null
        : typeof rawClientId === 'string'
        ? rawClientId.trim()
        : undefined;

    if (!appointmentId || !UUID_REGEX.test(appointmentId)) {
      return NextResponse.json(
        { error: 'Invalid or missing appointmentId.' },
        { status: 400 }
      );
    }

    if (targetClientId !== null && (typeof targetClientId !== 'string' || !UUID_REGEX.test(targetClientId))) {
      return NextResponse.json(
        { error: 'Invalid clientId format. Expected existing CRM client UUID or null.' },
        { status: 400 }
      );
    }

    const adminDb = getSupabaseAdmin();

    // 1. Fetch the existing appointment to verify ownership and existence
    const { data: existingAppt, error: apptErr } = await adminDb
      .from('calendar_appointments')
      .select('id, agent_id, client_id, title, starts_at, status')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr) {
      return NextResponse.json(
        { error: apptErr.message || 'Database error looking up appointment.' },
        { status: 500 }
      );
    }

    if (!existingAppt) {
      return NextResponse.json(
        { error: 'Appointment record not found.' },
        { status: 404 }
      );
    }

    // 2. Verify authorization for this appointment's agent scope
    const authCheck = await checkUserCalendarAuthorization(
      user.id,
      existingAppt.agent_id
    );
    if (!authCheck.authorized) {
      return NextResponse.json(
        { error: authCheck.reason || 'Forbidden: Not authorized for this agent scope.' },
        { status: 403 }
      );
    }

    // 3. If linking to a client, strictly verify the client exists in the CRM and belongs to the authorized scope
    let verifiedClientName: string | null = null;
    if (targetClientId !== null) {
      const { data: existingClient, error: clientErr } = await adminDb
        .from('clients')
        .select('id, agent_id, full_name')
        .eq('id', targetClientId)
        .maybeSingle();

      if (clientErr) {
        return NextResponse.json(
          { error: clientErr.message || 'Failed to verify target CRM customer.' },
          { status: 500 }
        );
      }

      if (!existingClient) {
        return NextResponse.json(
          { error: 'Selected CRM customer does not exist.' },
          { status: 404 }
        );
      }

      if (existingClient.agent_id && existingClient.agent_id !== existingAppt.agent_id) {
        return NextResponse.json(
          {
            error:
              'Selected customer belongs to a different agent portfolio and cannot be linked to this appointment.',
          },
          { status: 403 }
        );
      }

      verifiedClientName = existingClient.full_name;
    }

    // 4. Perform single-row update of ONLY client_id and updated_at
    const nowIso = new Date().toISOString();
    const { data: updatedAppt, error: updateErr } = await adminDb
      .from('calendar_appointments')
      .update({
        client_id: targetClientId,
        updated_at: nowIso,
      })
      .eq('id', appointmentId)
      .eq('agent_id', existingAppt.agent_id)
      .select('id, agent_id, client_id, updated_at')
      .single();

    if (updateErr || !updatedAppt) {
      return NextResponse.json(
        { error: updateErr?.message || 'Failed to persist appointment link in Supabase.' },
        { status: 500 }
      );
    }

    // 5. Audit log the manual reconciliation action
    logCalendarAuditAction({
      action: 'EDIT_APPOINTMENT',
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: authCheck.isAdmin
        ? 'admin'
        : authCheck.isAssistant
        ? 'assistant'
        : 'agent',
      targetAgentId: existingAppt.agent_id,
      targetAgentName: authCheck.targetAgentName,
      details: {
        operation: targetClientId ? 'CONFIRM_APPOINTMENT_CLIENT_LINK' : 'UNLINK_APPOINTMENT_CLIENT',
        appointmentId,
        previousClientId: existingAppt.client_id,
        newClientId: targetClientId,
        verifiedClientName,
      },
    });

    return NextResponse.json({
      success: true,
      appointment: updatedAppt,
      verifiedClientName,
    });
  } catch (err: any) {
    console.error('[API /api/calendar/appointments/link Error]:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error updating appointment link.' },
      { status: 500 }
    );
  }
}
