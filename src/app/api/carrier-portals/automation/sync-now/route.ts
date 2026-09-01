import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { processNextJob } from '@/lib/carrier-portals/automation/worker-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const carrier = body.carrier || 'oscar';
    const nowIso = new Date().toISOString();

    // Check if carrier connection exists and is connected
    const { data: connection } = await supabase
      .from('carrier_connections')
      .select('*')
      .eq('agent_id', user.id)
      .eq('carrier', carrier)
      .maybeSingle();

    if (!connection || (connection.connection_status !== 'connected' && connection.connection_status !== 'imported')) {
      return NextResponse.json(
        { error: `Carrier '${carrier}' connection setup required. Please connect carrier portal session first.` },
        { status: 400 }
      );
    }

    // DUPLICATE SYNC PROTECTION: Check for existing active job (queued or running)
    const { data: activeJobs } = await supabase
      .from('carrier_sync_jobs')
      .select('*')
      .eq('agent_id', user.id)
      .eq('carrier', carrier)
      .in('status', ['queued', 'running']);

    if (activeJobs && activeJobs.length > 0) {
      const activeJob = activeJobs[0];
      console.log(`[Sync Now] Duplicate sync prevented: Job ${activeJob.id} is already ${activeJob.status} for ${carrier}`);
      return NextResponse.json({
        success: true,
        isAlreadyRunning: true,
        job_id: activeJob.id,
        status: activeJob.status,
        job: activeJob,
        message: 'Sync already in progress for this carrier connection.',
      });
    }

    // Enqueue manual job into carrier_sync_jobs
    const { data: newJob, error: jobErr } = await supabase
      .from('carrier_sync_jobs')
      .insert({
        agent_id: user.id,
        connection_id: connection.id,
        carrier,
        trigger_type: 'manual',
        status: 'queued',
        scheduled_for: nowIso,
        attempts: 0,
        max_attempts: 3,
      })
      .select()
      .single();

    if (jobErr) {
      if (jobErr.code === '23505' || jobErr.message.includes('unique')) {
        const { data: existingActive } = await supabase
          .from('carrier_sync_jobs')
          .select('*')
          .eq('agent_id', user.id)
          .eq('carrier', carrier)
          .in('status', ['queued', 'running'])
          .single();

        return NextResponse.json({
          success: true,
          isAlreadyRunning: true,
          job_id: existingActive?.id,
          status: existingActive?.status || 'queued',
          job: existingActive,
          message: 'Sync already in progress.',
        });
      }
      throw new Error(`Failed to enqueue manual sync job: ${jobErr.message}`);
    }

    // Trigger immediate worker processing pass for quick local response
    processNextJob(supabase, 'web-sync-now-worker').catch((err) =>
      console.error('Background worker pass error:', err)
    );

    return NextResponse.json({
      success: true,
      isAlreadyRunning: false,
      job_id: newJob.id,
      status: newJob.status,
      job: newJob,
      message: 'Manual sync job queued successfully.',
    });
  } catch (err: any) {
    console.error('Error queuing manual sync:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to enqueue manual sync.' },
      { status: 500 }
    );
  }
}
