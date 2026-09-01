import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const carrier = searchParams.get('carrier') || 'oscar';
    const jobId = searchParams.get('job_id');

    let activeJob: any = null;
    let jobs: any[] = [];

    if (jobId) {
      const { data: specificJob } = await supabase
        .from('carrier_sync_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      activeJob = specificJob || null;
    }

    const { data: recentJobs, error } = await supabase
      .from('carrier_sync_jobs')
      .select('*')
      .eq('agent_id', user.id)
      .eq('carrier', carrier)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    jobs = recentJobs || [];
    if (!activeJob) {
      activeJob = jobs.find((j) => j.status === 'queued' || j.status === 'running') || null;
    }

    // Check worker health status (heartbeat or recent job activity within 5 minutes)
    const activeThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentJobsActivity } = await supabase
      .from('carrier_sync_jobs')
      .select('id')
      .gte('updated_at', activeThresholdIso)
      .limit(1);

    // Worker is online if there is active job processing or recent worker activity
    const workerOnline = (recentJobsActivity && recentJobsActivity.length > 0) || Boolean(activeJob);

    return NextResponse.json({
      success: true,
      activeJob: activeJob || null,
      workerOnline,
      jobs: jobs || [],
    });
  } catch (err: any) {
    console.error('Error fetching carrier sync jobs:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch carrier sync jobs.' },
      { status: 500 }
    );
  }
}
