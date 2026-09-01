import { SupabaseClient } from '@supabase/supabase-js';
import { parseOscarCsv } from './oscar-csv-parser';
import { parseAmbetterCsv } from './parsers/ambetter-parser';
import { evaluateRecordMatch, CrmClientCandidate } from './matching-engine';
import { detectCarrierChanges } from './change-detector';
import { CarrierType, SyncSourceType, NormalizedCarrierRecord } from './types';
import { assertNoSyntheticData } from './test-safety-guard';

export interface ExecuteSyncOptions {
  supabase: SupabaseClient;
  agentId: string;
  carrier?: CarrierType;
  source?: SyncSourceType;
  csvContent?: string;
  records?: NormalizedCarrierRecord[];
}

export async function executeCarrierSync(options: ExecuteSyncOptions) {
  const {
    supabase,
    agentId,
    carrier = 'oscar',
    source = 'manual_csv',
    csvContent,
    records: inputRecords,
  } = options;

  let records: NormalizedCarrierRecord[] = [];

  if (inputRecords && inputRecords.length > 0) {
    records = inputRecords;
  } else if (csvContent) {
    if (carrier === 'ambetter') {
      records = parseAmbetterCsv(csvContent);
    } else {
      const parsed = parseOscarCsv(csvContent);
      records = parsed.records;
    }
  } else {
    throw new Error('No records or CSV content provided for sync execution.');
  }

  // Enforce synthetic data guard: reject synthetic records on real connections
  assertNoSyntheticData(carrier, agentId, records);

  // 1. Get or create connection
  const nowIso = new Date().toISOString();
  let connectionId: string | null = null;

  const existingConnResult = await supabase
    .from('carrier_connections')
    .select('id, last_successful_sync_run_id')
    .eq('agent_id', agentId)
    .eq('carrier', carrier)
    .maybeSingle();
  let existingConn: any = existingConnResult.data;
  const hasLastSuccessfulSyncPointer = !existingConnResult.error;

  if (existingConnResult.error) {
    const isMissingPointerColumn = existingConnResult.error.code === '42703'
      || existingConnResult.error.message.includes('last_successful_sync_run_id');

    if (!isMissingPointerColumn) {
      throw existingConnResult.error;
    }

    const { data: fallbackConn, error: fallbackConnErr } = await supabase
      .from('carrier_connections')
      .select('id')
      .eq('agent_id', agentId)
      .eq('carrier', carrier)
      .maybeSingle();

    if (fallbackConnErr) {
      throw fallbackConnErr;
    }

    existingConn = fallbackConn;
  }

  if (existingConn) {
    connectionId = existingConn.id;
  } else {
    const { data: newConn, error: connErr } = await supabase
      .from('carrier_connections')
      .insert({
        agent_id: agentId,
        carrier,
        connection_status: 'imported',
        sync_source: source,
        last_sync_at: nowIso,
        last_success_at: nowIso,
      })
      .select('id')
      .single();

    if (!connErr && newConn) {
      connectionId = newConn.id;
    }
  }

  // 2. Create carrier_sync_runs record
  const { data: syncRun, error: syncRunErr } = await supabase
    .from('carrier_sync_runs')
    .insert({
      connection_id: connectionId,
      agent_id: agentId,
      carrier,
      source,
      started_at: nowIso,
      status: 'running',
      records_found: records.length,
    })
    .select('id')
    .single();

  if (syncRunErr || !syncRun) {
    throw new Error(`Failed to create sync run: ${syncRunErr?.message || 'Unknown error'}`);
  }

  const syncRunId = syncRun.id;

  try {
    // 3. Fetch candidate clients for agent
    const { data: candidateClients } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, date_of_birth')
      .eq('agent_id', agentId);

    const clientsList: CrmClientCandidate[] = (candidateClients || []).map((c: any) => ({
      id: c.id,
      full_name: c.full_name || '',
      email: c.email || null,
      phone: c.phone || null,
      date_of_birth: c.date_of_birth || null,
    }));

    // 4. Fetch existing client matches for agent + carrier
    const { data: existingMatches } = await supabase
      .from('carrier_client_matches')
      .select('external_member_id, client_id, match_status, confidence_score, match_method')
      .eq('agent_id', agentId)
      .eq('carrier', carrier);

    const existingMatchMap = new Map<string, any>();
    (existingMatches || []).forEach((m: any) => {
      existingMatchMap.set(m.external_member_id, m);
    });

    // 5. Evaluate matches
    const calculatedMatches: any[] = [];
    const matchesMap = new Map<string, string | null>(); // external_member_id -> client_id

    let matchedCount = 0;
    let reviewCount = 0;
    let unmatchedCount = 0;

    for (const record of records) {
      const existing = existingMatchMap.get(record.external_member_id);
      const matchResult = evaluateRecordMatch(record, clientsList, existing);

      calculatedMatches.push({
        agent_id: agentId,
        carrier,
        external_member_id: record.external_member_id,
        client_id: matchResult.client_id,
        match_status: matchResult.match_status,
        confidence_score: matchResult.confidence_score,
        match_method: matchResult.match_method,
        updated_at: nowIso,
      });

      matchesMap.set(record.external_member_id, matchResult.client_id);

      if (matchResult.match_status === 'matched') matchedCount++;
      else if (matchResult.match_status === 'review') reviewCount++;
      else unmatchedCount++;
    }

    // 6. Fetch previous carrier_records to run change detection
    const { data: previousRecords } = await supabase
      .from('carrier_records')
      .select('*')
      .eq('agent_id', agentId)
      .eq('carrier', carrier);

    const isBaseline = !previousRecords || previousRecords.length === 0;

    // 7. Detect changes
    const rawEvents = detectCarrierChanges({
      isBaseline,
      currentRecords: records,
      previousRecords: previousRecords || [],
      matchesMap,
      syncRunId,
      agentId,
      carrier,
    });

    // 8. DB Writes / Persistence
    // A. Upsert carrier_client_matches
    if (calculatedMatches.length > 0) {
      const { error: matchUpsertErr } = await supabase
        .from('carrier_client_matches')
        .upsert(calculatedMatches, { onConflict: 'agent_id,carrier,external_member_id' });

      if (matchUpsertErr) {
        console.error('Error upserting carrier_client_matches:', matchUpsertErr);
      }
    }

    // B. Upsert carrier_records
    const recordsToUpsert = records.map((r) => ({
      connection_id: connectionId,
      agent_id: agentId,
      carrier,
      external_member_id: r.external_member_id,
      member_name: r.member_name,
      date_of_birth: r.date_of_birth,
      email: r.email,
      phone: r.phone,
      mailing_address: r.mailing_address,
      state: r.state,
      enrollment_type: r.enrollment_type,
      on_exchange: r.on_exchange,
      plan: r.plan,
      balance: r.balance,
      premium_amount: r.premium_amount,
      aptc_subsidy: r.aptc_subsidy,
      lives: r.lives,
      coverage_start_date: r.coverage_start_date,
      coverage_end_date: r.coverage_end_date,
      carrier_status: r.carrier_status,
      autopay: r.autopay,
      account_creation_status: r.account_creation_status,
      ichra_member: r.ichra_member,
      estimated_fpl: r.estimated_fpl,
      verification_needed: r.verification_needed,
      verification_completed: r.verification_completed,
      raw_data: r.raw_data,
      last_seen_at: nowIso,
      latest_sync_run_id: syncRunId,
    }));

    if (recordsToUpsert.length > 0) {
      const { error: recUpsertErr } = await supabase
        .from('carrier_records')
        .upsert(recordsToUpsert, { onConflict: 'agent_id,carrier,external_member_id' });

      if (recUpsertErr) {
        console.error('Error upserting carrier_records:', recUpsertErr);
      }
    }

    // C. Insert snapshots
    const snapshotsToInsert = records.map((r) => ({
      sync_run_id: syncRunId,
      agent_id: agentId,
      carrier,
      external_member_id: r.external_member_id,
      client_id: matchesMap.get(r.external_member_id) || null,
      carrier_status: r.carrier_status,
      balance: r.balance,
      premium_amount: r.premium_amount,
      plan: r.plan,
      coverage_start_date: r.coverage_start_date,
      coverage_end_date: r.coverage_end_date,
      autopay: r.autopay,
      snapshot_data: r.raw_data,
      captured_at: nowIso,
    }));

    if (snapshotsToInsert.length > 0) {
      const { error: snapInsertErr } = await supabase
        .from('carrier_policy_snapshots')
        .insert(snapshotsToInsert);

      if (snapInsertErr) {
        console.error('Error inserting carrier_policy_snapshots:', snapInsertErr);
      }
    }

    // D. Insert events
    if (rawEvents.length > 0) {
      const eventsToInsert = rawEvents.map((ev) => ({
        ...ev,
        created_at: nowIso,
      }));

      const { error: evInsertErr } = await supabase
        .from('carrier_events')
        .insert(eventsToInsert);

      if (evInsertErr) {
        console.error('Error inserting carrier_events:', evInsertErr);
      }
    }

    // ZERO-RECORD PROMOTION PROTECTION: Reject promotion if previous active Book had records and new count is 0
    let previousActiveCount = 0;
    if (hasLastSuccessfulSyncPointer && existingConn?.last_successful_sync_run_id) {
      const { count: prevCount } = await supabase
        .from('carrier_records')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('carrier', carrier)
        .eq('latest_sync_run_id', existingConn.last_successful_sync_run_id);
      previousActiveCount = prevCount || 0;
    }

    if (previousActiveCount > 0 && records.length === 0) {
      throw new Error(
        `ZERO_RECORD_BOOK_NOT_PROMOTED: New sync returned 0 records while active Book has ${previousActiveCount} records. Promotion rejected to protect active Book.`
      );
    }

    // 9. Update carrier_sync_runs status to completed
    const completedIso = new Date().toISOString();
    await supabase
      .from('carrier_sync_runs')
      .update({
        completed_at: completedIso,
        status: 'completed',
        records_found: records.length,
        matched_count: matchedCount,
        review_count: reviewCount,
        unmatched_count: unmatchedCount,
        changed_count: rawEvents.length,
      })
      .eq('id', syncRunId);

    // 10. ATOMIC PROMOTION: Update carrier_connections pointer to new syncRunId
    if (connectionId) {
      const connectionUpdate: Record<string, any> = {
        connection_status: 'connected',
        last_sync_at: completedIso,
        last_success_at: completedIso,
        last_error: null,
        updated_at: completedIso,
      };

      if (hasLastSuccessfulSyncPointer) {
        connectionUpdate.last_successful_sync_run_id = syncRunId;
      }

      if (carrier === 'ambetter') {
        connectionUpdate.next_sync_at = new Date(
          new Date(completedIso).getTime() + 8 * 60 * 60 * 1000
        ).toISOString();
      }

      await supabase
        .from('carrier_connections')
        .update(connectionUpdate)
        .eq('id', connectionId);
    }

    return {
      success: true,
      syncRunId,
      recordsFound: records.length,
      matchedCount,
      reviewCount,
      unmatchedCount,
      changedCount: rawEvents.length,
      isBaseline,
    };
  } catch (err: any) {
    console.error('Sync run execution error:', err);

    const failedIso = new Date().toISOString();
    await supabase
      .from('carrier_sync_runs')
      .update({
        completed_at: failedIso,
        status: 'failed',
        error_message: err?.message || 'Unknown sync error',
      })
      .eq('id', syncRunId);

    if (connectionId) {
      await supabase
        .from('carrier_connections')
        .update({
          last_error: err?.message || 'Unknown sync error',
          updated_at: failedIso,
        })
        .eq('id', connectionId);
    }

    throw err;
  }
}
