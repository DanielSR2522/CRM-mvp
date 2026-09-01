import { SupabaseClient } from '@supabase/supabase-js';
import { adapterRegistry } from './adapter-registry';
import { executeCarrierSync } from '../sync-service';

export interface ProcessJobResult {
  claimed: boolean;
  jobId?: string;
  carrier?: string;
  status?: string;
  skipped?: boolean;
  retrying?: boolean;
  success?: boolean;
  error?: string;
}

/**
 * Claims and processes the next queued carrier sync job atomically,
 * enforcing per-connection concurrency, session validation, retry policies, and Phase 1 ingestion.
 */
export async function processNextJob(
  supabase: SupabaseClient,
  workerId = 'worker-1',
  targetAgentId?: string
): Promise<ProcessJobResult> {
  const nowIso = new Date().toISOString();

  // 0. Stale Job Recovery: Find running jobs with stale heartbeats/updated_at (> 2 min) and transition them cleanly
  const staleThresholdIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: staleJobs } = await supabase
    .from('carrier_sync_jobs')
    .select('id, carrier, agent_id, attempts, max_attempts')
    .eq('status', 'running')
    .lte('updated_at', staleThresholdIso);

  if (staleJobs && staleJobs.length > 0) {
    for (const sJob of staleJobs) {
      console.warn(`[Carrier Worker] Recovering stale job ${sJob.id} for ${sJob.carrier} (agent: ${sJob.agent_id}, attempt ${sJob.attempts}/${sJob.max_attempts})`);
      if (sJob.attempts < sJob.max_attempts) {
        await supabase
          .from('carrier_sync_jobs')
          .update({
            status: 'queued',
            error_code: 'WORKER_LEASE_EXPIRED',
            error_message: 'WORKER_LEASE_EXPIRED: Worker lease expired. Requeuing for retry attempt.',
            updated_at: nowIso,
          })
          .eq('id', sJob.id);
      } else {
        await supabase
          .from('carrier_sync_jobs')
          .update({
            status: 'failed',
            completed_at: nowIso,
            error_code: 'WORKER_LEASE_EXPIRED',
            error_message: 'WORKER_LEASE_EXPIRED: Worker lease expired after max attempts.',
            updated_at: nowIso,
          })
          .eq('id', sJob.id);
      }
    }
  }

  // 1. Atomic Job Claiming via RPC or direct locked query
  let job: any = null;

  if (!targetAgentId) {
    const { data: claimedRows, error: claimErr } = await supabase.rpc('claim_next_carrier_sync_job', {
      worker_id: workerId,
    });
    if (!claimErr && claimedRows && claimedRows.length > 0) {
      job = claimedRows[0];
    }
  }

  if (!job) {
    // Fallback or agent-scoped claim query
    let query = supabase
      .from('carrier_sync_jobs')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduled_for', nowIso);

    if (targetAgentId) {
      query = query.eq('agent_id', targetAgentId);
    }

    const { data: queuedJobs } = await query
      .order('scheduled_for', { ascending: true })
      .limit(1);

    if (queuedJobs && queuedJobs.length > 0) {
      const target = queuedJobs[0];
      const { data: updated } = await supabase
        .from('carrier_sync_jobs')
        .update({
          status: 'running',
          started_at: nowIso,
          attempts: target.attempts + 1,
          updated_at: nowIso,
        })
        .eq('id', target.id)
        .eq('status', 'queued') // optimistic lock check
        .select()
        .single();

      if (updated) {
        job = updated;
      }
    }
  }

  if (!job) {
    return { claimed: false };
  }

  console.log(`[Carrier Worker] Claimed job ${job.id} for carrier: ${job.carrier} (agent: ${job.agent_id}, trigger: ${job.trigger_type})`);

  // 2. Per-connection Concurrency Protection: Maximum 1 active running sync per agent + carrier
  const { data: runningJobs } = await supabase
    .from('carrier_sync_jobs')
    .select('id')
    .eq('agent_id', job.agent_id)
    .eq('carrier', job.carrier)
    .eq('status', 'running')
    .neq('id', job.id);

  if (runningJobs && runningJobs.length > 0) {
    console.log(`[Carrier Worker] Coalescing job ${job.id}: Another sync is already running for ${job.carrier}`);
    await supabase
      .from('carrier_sync_jobs')
      .update({
        status: 'skipped',
        completed_at: nowIso,
        error_message: 'Coalesced: another sync is actively running for this connection.',
        updated_at: nowIso,
      })
      .eq('id', job.id);

    return { claimed: true, jobId: job.id, carrier: job.carrier, skipped: true, status: 'skipped' };
  }

  // Update connection last_attempt_at
  await supabase
    .from('carrier_connections')
    .update({ last_attempt_at: nowIso, updated_at: nowIso })
    .eq('agent_id', job.agent_id)
    .eq('carrier', job.carrier);

  // 3. Resolve Carrier Adapter
  const adapter = adapterRegistry.getAdapter(job.carrier);
  if (!adapter) {
    const errorMsg = `No carrier automation adapter registered for '${job.carrier}'.`;
    console.error(`[Carrier Worker] ${errorMsg}`);
    await supabase
      .from('carrier_sync_jobs')
      .update({
        status: 'failed',
        completed_at: nowIso,
        error_code: 'NO_ADAPTER',
        error_message: errorMsg,
        updated_at: nowIso,
      })
      .eq('id', job.id);

    return { claimed: true, jobId: job.id, carrier: job.carrier, success: false, error: errorMsg };
  }

  // 4. Start periodic heartbeat timer while worker processes job
  let heartbeatTimer: any = null;
  let terminalWritten = false;

  heartbeatTimer = setInterval(async () => {
    try {
      const hbIso = new Date().toISOString();
      const leaseIso = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await supabase
        .from('carrier_sync_jobs')
        .update({ heartbeat_at: hbIso, lease_expires_at: leaseIso, updated_at: hbIso })
        .eq('id', job.id)
        .eq('status', 'running');
    } catch (e) {}
  }, 15000);

  try {
    // 5. Validate Carrier Session
    const sessionStatus = await adapter.validateSession(job.agent_id);

    if (sessionStatus !== 'connected') {
      const reauthMsg = 'Carrier session expired. Reauthentication required.';
      console.log(`[Carrier Worker] Job ${job.id} failed session validation: ${sessionStatus}`);

      await supabase
        .from('carrier_sync_jobs')
        .update({
          status: 'reauthentication_required',
          completed_at: nowIso,
          error_code: 'REAUTHENTICATION_REQUIRED',
          error_message: reauthMsg,
          updated_at: nowIso,
        })
        .eq('id', job.id);

      await supabase
        .from('carrier_connections')
        .update({
          connection_status: 'reauthentication_required',
          automation_enabled: false,
          last_error: reauthMsg,
          updated_at: nowIso,
        })
        .eq('agent_id', job.agent_id)
        .eq('carrier', job.carrier);

      terminalWritten = true;
      return {
        claimed: true,
        jobId: job.id,
        carrier: job.carrier,
        status: 'reauthentication_required',
        success: false,
        error: reauthMsg,
      };
    }

    // 6. Execute Carrier Portal Sync & Ingest CSV
    console.log(`[Carrier Worker] Executing portal download for ${job.carrier}...`);
    const payload = await adapter.syncBook(job.agent_id);

    if (!payload.csvContent || !payload.csvContent.trim()) {
      throw new Error('Downloaded carrier CSV payload is empty.');
    }

    // Ingest into Phase 1 Canonical Pipeline with source: 'automated_portal'
    const syncRunResult = await executeCarrierSync({
      supabase,
      agentId: job.agent_id,
      carrier: job.carrier as any,
      source: 'automated_portal',
      csvContent: payload.csvContent,
    });

    const completedIso = new Date().toISOString();
    await supabase
      .from('carrier_sync_jobs')
      .update({
        status: 'completed',
        completed_at: completedIso,
        error_code: null,
        error_message: null,
        updated_at: completedIso,
      })
      .eq('id', job.id);

    await supabase
      .from('carrier_connections')
      .update({
        connection_status: 'connected',
        last_success_at: completedIso,
        last_error: null,
        updated_at: completedIso,
      })
      .eq('agent_id', job.agent_id)
      .eq('carrier', job.carrier);

    console.log(`[Carrier Worker] Job ${job.id} COMPLETED SUCCESSFULLY! Found ${syncRunResult.recordsFound} records.`);

    terminalWritten = true;
    return {
      claimed: true,
      jobId: job.id,
      carrier: job.carrier,
      status: 'completed',
      success: true,
    };
  } catch (syncErr: any) {
    const errorMsg = syncErr?.message || 'Carrier portal sync execution failed.';
    console.error(`[Carrier Worker] Job ${job.id} execution failed (attempt ${job.attempts}/${job.max_attempts}):`, errorMsg);

    const isTransientError = !errorMsg.includes('Reauthentication') && !errorMsg.includes('login') && !errorMsg.includes('credentials');

    if (isTransientError && job.attempts < job.max_attempts) {
      console.log(`[Carrier Worker] Requeuing job ${job.id} for retry attempt ${job.attempts + 1}...`);
      await supabase
        .from('carrier_sync_jobs')
        .update({
          status: 'queued',
          error_code: 'RETRYABLE_ERROR',
          error_message: `Attempt ${job.attempts} failed: ${errorMsg}`,
          updated_at: nowIso,
        })
        .eq('id', job.id);

      terminalWritten = true;
      return {
        claimed: true,
        jobId: job.id,
        carrier: job.carrier,
        retrying: true,
        status: 'queued',
        error: errorMsg,
      };
    } else {
      const failedIso = new Date().toISOString();
      await supabase
        .from('carrier_sync_jobs')
        .update({
          status: 'failed',
          completed_at: failedIso,
          error_code: 'SYNC_FAILED',
          error_message: errorMsg,
          updated_at: failedIso,
        })
        .eq('id', job.id);

      await supabase
        .from('carrier_connections')
        .update({
          last_error: errorMsg,
          updated_at: failedIso,
        })
        .eq('agent_id', job.agent_id)
        .eq('carrier', job.carrier);

      terminalWritten = true;
      return {
        claimed: true,
        jobId: job.id,
        carrier: job.carrier,
        status: 'failed',
        success: false,
        error: errorMsg,
      };
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (!terminalWritten) {
      console.error(`[Carrier Worker] Emergency finalizer: Forcing failed status for unhandled exit on job ${job.id}`);
      const errIso = new Date().toISOString();
      await supabase
        .from('carrier_sync_jobs')
        .update({
          status: 'failed',
          completed_at: errIso,
          error_code: 'UNEXPECTED_WORKER_EXIT',
          error_message: 'Worker execution exited unexpectedly without writing terminal status.',
          updated_at: errIso,
        })
        .eq('id', job.id);
    }
  }
}
