import { SupabaseClient } from '@supabase/supabase-js';

export interface SchedulerCheckResult {
  checkedCount: number;
  jobsEnqueued: number;
  skippedDuplicates: number;
  errors: string[];
}

/**
 * Finds all active, automation-enabled carrier connections due for sync,
 * enqueues scheduled carrier sync jobs idempotently, and calculates next_sync_at without schedule drift.
 */
export async function runSchedulerCheck(supabase: SupabaseClient): Promise<SchedulerCheckResult> {
  const nowIso = new Date().toISOString();

  // Find enabled, connected connections due for sync
  const { data: dueConnections, error: queryErr } = await supabase
    .from('carrier_connections')
    .select('*')
    .eq('automation_enabled', true)
    .in('connection_status', ['connected', 'imported'])
    .or(`next_sync_at.lte.${nowIso},next_sync_at.is.null`);

  if (queryErr) {
    console.error('[Carrier Scheduler] Error querying due connections:', queryErr);
    return { checkedCount: 0, jobsEnqueued: 0, skippedDuplicates: 0, errors: [queryErr.message] };
  }

  if (!dueConnections || dueConnections.length === 0) {
    return { checkedCount: 0, jobsEnqueued: 0, skippedDuplicates: 0, errors: [] };
  }

  let jobsEnqueued = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];

  for (const conn of dueConnections) {
    const scheduledFor = conn.next_sync_at || nowIso;
    const intervalHours = conn.sync_interval_hours || 8;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Calculate next_sync_at from scheduledFor timestamp to prevent schedule drift
    const prevTime = new Date(scheduledFor).getTime();
    const currentTime = Date.now();
    let nextTime = prevTime + intervalMs;
    // If next calculated time is still in the past, align from current time
    if (nextTime <= currentTime) {
      nextTime = currentTime + intervalMs;
    }
    const nextSyncAt = new Date(nextTime).toISOString();

    // Enqueue job idempotently into carrier_sync_jobs
    const { error: insertErr } = await supabase
      .from('carrier_sync_jobs')
      .insert({
        agent_id: conn.agent_id,
        connection_id: conn.id,
        carrier: conn.carrier,
        trigger_type: 'scheduled',
        status: 'queued',
        scheduled_for: scheduledFor,
        attempts: 0,
        max_attempts: 3,
      });

    if (insertErr) {
      // Postgres error 23505 = unique constraint violation (duplicate schedule cycle)
      if (insertErr.code === '23505' || insertErr.message.includes('unique') || insertErr.message.includes('duplicate')) {
        skippedDuplicates++;
        console.log(`[Carrier Scheduler] Skipping duplicate job for connection ${conn.id} at ${scheduledFor}`);
      } else {
        console.error(`[Carrier Scheduler] Insert error for connection ${conn.id}:`, insertErr);
        errors.push(insertErr.message);
      }
    } else {
      jobsEnqueued++;
      console.log(`[Carrier Scheduler] Enqueued scheduled job for ${conn.carrier} (${conn.agent_id}) for cycle ${scheduledFor}`);
    }

    // Update connection next_sync_at timestamp
    await supabase
      .from('carrier_connections')
      .update({
        last_scheduled_sync_at: nowIso,
        next_sync_at: nextSyncAt,
        updated_at: nowIso,
      })
      .eq('id', conn.id);
  }

  return {
    checkedCount: dueConnections.length,
    jobsEnqueued,
    skippedDuplicates,
    errors,
  };
}
